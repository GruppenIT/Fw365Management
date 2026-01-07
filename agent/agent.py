#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Firewall365 Agent - OPNSense Telemetry Collector

Este agente coleta métricas de telemetria de dispositivos OPNSense
e envia para a plataforma central Firewall365.

O agente faz auto-registro automaticamente na primeira execução.

Coleta em 3 tiers:
- Alta frequência (1-3 min): CPU, memória, throughput
- Média frequência (5-10 min): Interfaces, serviços
- Baixa frequência (30-60 min): Sistema, disco, versão

Autor: Firewall365
Versão: 3.0.0
Licença: MIT
"""

import os
import sys
import time
import json
import logging
import signal
import socket
import subprocess
import configparser
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List

try:
    import requests
    from requests.auth import HTTPBasicAuth
except ImportError:
    print("ERRO: Módulo 'requests' não encontrado.")
    print("Instale com: pkg install py311-requests")
    sys.exit(1)

DEFAULT_CONFIG = {
    'opnsense': {
        'api_url': 'https://127.0.0.1/api',
        'api_key': '',
        'api_secret': '',
        'verify_ssl': 'false'
    },
    'firewall365': {
        'endpoint': 'https://opn.gruppen.com.br/api',
        'bearer_token': '',
        'firewall_id': '',
        'verify_ssl': 'true'
    },
    'agent': {
        'interval_high': '60',
        'interval_medium': '300',
        'interval_low': '1800',
        'log_level': 'INFO',
        'log_file': '/var/log/firewall365/agent.log'
    }
}

CONFIG_PATH = '/etc/firewall365/agent.conf'


class Firewall365Agent:
    """Agente de coleta de telemetria para OPNSense."""
    
    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self.config = self._load_config()
        self._setup_logging()
        self.running = True
        self.last_cpu_times = None
        
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        
    def _load_config(self) -> configparser.ConfigParser:
        """Carrega configuração do arquivo."""
        config = configparser.ConfigParser()
        
        for section, options in DEFAULT_CONFIG.items():
            config[section] = options
        
        if os.path.exists(self.config_path):
            config.read(self.config_path)
        else:
            print(f"AVISO: Arquivo de configuração não encontrado: {self.config_path}")
            print("Criando configuração padrão...")
            self._create_default_config()
            config.read(self.config_path)
        
        return config
    
    def _create_default_config(self):
        """Cria arquivo de configuração padrão."""
        config_dir = os.path.dirname(self.config_path)
        if config_dir and not os.path.exists(config_dir):
            os.makedirs(config_dir, exist_ok=True)
        
        config = configparser.ConfigParser()
        for section, options in DEFAULT_CONFIG.items():
            config[section] = options
        
        with open(self.config_path, 'w') as f:
            config.write(f)
    
    def _save_config(self):
        """Salva configuração atual no arquivo."""
        with open(self.config_path, 'w') as f:
            self.config.write(f)
    
    def _setup_logging(self):
        """Configura sistema de logging."""
        log_level = getattr(logging, self.config.get('agent', 'log_level', fallback='INFO'))
        log_file = self.config.get('agent', 'log_file', fallback='/var/log/firewall365/agent.log')
        
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger('firewall365-agent')
    
    def _signal_handler(self, signum, frame):
        """Handler para sinais de término."""
        self.logger.info(f"Sinal {signum} recebido. Encerrando agente...")
        self.running = False
    
    def _get_system_info(self) -> Dict[str, Any]:
        """Coleta informações do sistema OPNSense."""
        info = {
            'hostname': socket.gethostname(),
            'serialNumber': self._get_serial_number(),
            'version': self._get_opnsense_version(),
            'ipAddress': self._get_primary_ip(),
        }
        return info
    
    def _get_serial_number(self) -> str:
        """Obtém número de série do sistema."""
        try:
            result = subprocess.run(
                ['sysctl', '-n', 'kern.hostuuid'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                return result.stdout.strip()[:36]
        except Exception:
            pass
        
        try:
            result = subprocess.run(
                ['dmidecode', '-s', 'system-serial-number'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass
        
        return socket.gethostname() + "-" + hex(hash(socket.gethostname()))[-8:]
    
    def _get_opnsense_version(self) -> str:
        """Obtém versão do OPNSense."""
        try:
            if os.path.exists('/usr/local/opnsense/version/opnsense'):
                with open('/usr/local/opnsense/version/opnsense', 'r') as f:
                    return f.read().strip()
        except Exception:
            pass
        
        try:
            result = subprocess.run(
                ['opnsense-version', '-v'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass
        
        return "Unknown"
    
    def _get_primary_ip(self) -> str:
        """Obtém IP primário do sistema."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "0.0.0.0"
    
    def auto_register(self) -> bool:
        """Registra o firewall automaticamente na plataforma."""
        endpoint = self.config.get('firewall365', 'endpoint')
        verify_ssl = self.config.getboolean('firewall365', 'verify_ssl', fallback=True)
        
        if self.config.get('firewall365', 'bearer_token') and self.config.get('firewall365', 'firewall_id'):
            self.logger.info("Firewall já registrado. Pulando auto-registro.")
            return True
        
        self.logger.info("Iniciando auto-registro do firewall...")
        
        system_info = self._get_system_info()
        self.logger.info(f"Informações do sistema: {system_info}")
        
        register_url = f"{endpoint}/agent/register"
        
        try:
            response = requests.post(
                register_url,
                json=system_info,
                verify=verify_ssl,
                timeout=30
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                
                if 'token' in data:
                    self.config.set('firewall365', 'bearer_token', data['token'])
                    self.config.set('firewall365', 'firewall_id', data['firewallId'])
                    self._save_config()
                    
                    self.logger.info(f"Firewall registrado com sucesso!")
                    self.logger.info(f"Firewall ID: {data['firewallId']}")
                    self.logger.info(f"Status: {data.get('status', 'pending')}")
                    
                    if data.get('note'):
                        self.logger.info(f"Nota: {data['note']}")
                    
                    return True
                elif data.get('hasToken'):
                    self.logger.warning("Firewall já registrado mas token não está no config local.")
                    self.logger.warning("Reconfigure manualmente ou delete o firewall na console.")
                    return False
            else:
                self.logger.error(f"Erro no registro: HTTP {response.status_code}")
                self.logger.error(f"Resposta: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Erro de conexão no auto-registro: {e}")
            return False
    
    def _get_opnsense_api(self, endpoint: str) -> Optional[Dict[str, Any]]:
        """Faz requisição à API do OPNSense."""
        api_url = self.config.get('opnsense', 'api_url')
        api_key = self.config.get('opnsense', 'api_key')
        api_secret = self.config.get('opnsense', 'api_secret')
        verify_ssl = self.config.getboolean('opnsense', 'verify_ssl', fallback=False)
        
        url = f"{api_url}/{endpoint}"
        
        try:
            response = requests.get(
                url,
                auth=HTTPBasicAuth(api_key, api_secret),
                verify=verify_ssl,
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                self.logger.warning(f"API OPNSense retornou {response.status_code}: {endpoint}")
                return None
                
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Erro ao acessar API OPNSense ({endpoint}): {e}")
            return None

    def _get_cpu_percent(self) -> float:
        """Coleta uso de CPU com cálculo preciso entre intervalos."""
        try:
            result = subprocess.run(
                ['sysctl', '-n', 'kern.cp_time'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                cpu_times = [int(x) for x in result.stdout.strip().split()]
                if len(cpu_times) >= 5:
                    if self.last_cpu_times:
                        idle_diff = cpu_times[4] - self.last_cpu_times[4]
                        total_diff = sum(cpu_times) - sum(self.last_cpu_times)
                        cpu_percent = round((1 - idle_diff / total_diff) * 100, 2) if total_diff > 0 else 0
                    else:
                        idle = cpu_times[4]
                        total = sum(cpu_times)
                        cpu_percent = round((1 - idle / total) * 100, 2) if total > 0 else 0
                    self.last_cpu_times = cpu_times
                    return cpu_percent
        except Exception as e:
            self.logger.debug(f"Erro ao coletar CPU: {e}")
        return 0.0

    def _get_memory_percent(self) -> float:
        """Coleta uso de memória."""
        try:
            result = subprocess.run(
                ['sysctl', '-n', 'hw.physmem', 'vm.stats.vm.v_inactive_count', 
                 'vm.stats.vm.v_cache_count', 'vm.stats.vm.v_free_count'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                if len(lines) >= 1:
                    physmem = int(lines[0])
                    page_size = 4096
                    free_pages = sum(int(lines[i]) for i in range(1, len(lines)) if lines[i].isdigit())
                    free_mem = free_pages * page_size
                    used_mem = physmem - free_mem
                    return round((used_mem / physmem) * 100, 2) if physmem > 0 else 0
        except Exception as e:
            self.logger.debug(f"Erro ao coletar memória: {e}")
        return 0.0

    def collect_high_frequency(self) -> Optional[Dict[str, Any]]:
        """Coleta dados de alta frequência (CPU, memória, throughput)."""
        telemetry = {
            'cpu': self._get_cpu_percent(),
            'memory': self._get_memory_percent(),
            'wanThroughput': 0.0,
            'interfaces': {}
        }
        
        traffic_data = self._get_opnsense_api('diagnostics/traffic/interface')
        if traffic_data and 'interfaces' in traffic_data:
            total_throughput = 0
            for iface_name, iface_data in traffic_data.get('interfaces', {}).items():
                if isinstance(iface_data, dict):
                    rate_in = iface_data.get('rate_bits_in', 0)
                    rate_out = iface_data.get('rate_bits_out', 0)
                    total_throughput += rate_in + rate_out
                    telemetry['interfaces'][iface_name] = {
                        'rateIn': rate_in,
                        'rateOut': rate_out
                    }
            telemetry['wanThroughput'] = round(total_throughput / 1_000_000, 2)
        
        return telemetry
    
    def collect_medium_frequency(self) -> Dict[str, Any]:
        """Coleta dados de média frequência (interfaces, serviços)."""
        result = {
            'interfaces': [],
            'services': []
        }
        
        iface_data = self._get_opnsense_api('diagnostics/interface/getInterfaceStatistics')
        if iface_data and 'statistics' in iface_data:
            for name, stats in iface_data['statistics'].items():
                if isinstance(stats, dict):
                    result['interfaces'].append({
                        'interfaceName': name,
                        'description': stats.get('description', ''),
                        'status': 'up' if stats.get('status') == 'active' else 'down',
                        'macAddress': stats.get('macaddr', ''),
                        'ipAddress': stats.get('ipaddr', ''),
                        'rxBytes': float(stats.get('bytes received', 0)),
                        'txBytes': float(stats.get('bytes transmitted', 0)),
                        'rxPackets': float(stats.get('packets received', 0)),
                        'txPackets': float(stats.get('packets transmitted', 0)),
                        'rxErrors': float(stats.get('input errors', 0)),
                        'txErrors': float(stats.get('output errors', 0)),
                        'linkSpeed': stats.get('media', '')
                    })
        
        if not result['interfaces']:
            iface_names = self._get_opnsense_api('diagnostics/interface/getInterfaceNames')
            if iface_names:
                for name, desc in iface_names.items():
                    result['interfaces'].append({
                        'interfaceName': name,
                        'description': desc if isinstance(desc, str) else str(desc),
                        'status': 'unknown'
                    })
        
        svc_data = self._get_opnsense_api('core/service/search')
        if svc_data and 'rows' in svc_data:
            for svc in svc_data['rows']:
                if isinstance(svc, dict):
                    result['services'].append({
                        'serviceName': svc.get('name', ''),
                        'serviceDescription': svc.get('description', ''),
                        'status': svc.get('status', ''),
                        'isRunning': 'running' if svc.get('running', 0) == 1 else 'stopped'
                    })
        
        return result
    
    def collect_low_frequency(self) -> Dict[str, Any]:
        """Coleta dados de baixa frequência (sistema, disco)."""
        result = {
            'uptime': 0,
            'loadAvg1': 0,
            'loadAvg5': 0,
            'loadAvg15': 0,
            'diskTotal': 0,
            'diskUsed': 0,
            'diskPercent': 0,
            'temperature': None,
            'firmwareVersion': self._get_opnsense_version()
        }
        
        try:
            uptime_result = subprocess.run(
                ['sysctl', '-n', 'kern.boottime'],
                capture_output=True, text=True, timeout=5
            )
            if uptime_result.returncode == 0:
                import re
                match = re.search(r'sec = (\d+)', uptime_result.stdout)
                if match:
                    boot_time = int(match.group(1))
                    result['uptime'] = time.time() - boot_time
        except Exception as e:
            self.logger.debug(f"Erro ao coletar uptime: {e}")
        
        try:
            load_result = subprocess.run(
                ['sysctl', '-n', 'vm.loadavg'],
                capture_output=True, text=True, timeout=5
            )
            if load_result.returncode == 0:
                parts = load_result.stdout.strip().replace('{', '').replace('}', '').split()
                if len(parts) >= 3:
                    result['loadAvg1'] = float(parts[0])
                    result['loadAvg5'] = float(parts[1])
                    result['loadAvg15'] = float(parts[2])
        except Exception as e:
            self.logger.debug(f"Erro ao coletar load average: {e}")
        
        try:
            df_result = subprocess.run(
                ['df', '-k', '/'],
                capture_output=True, text=True, timeout=5
            )
            if df_result.returncode == 0:
                lines = df_result.stdout.strip().split('\n')
                if len(lines) >= 2:
                    parts = lines[1].split()
                    if len(parts) >= 5:
                        total_kb = int(parts[1])
                        used_kb = int(parts[2])
                        result['diskTotal'] = total_kb / (1024 * 1024)
                        result['diskUsed'] = used_kb / (1024 * 1024)
                        result['diskPercent'] = (used_kb / total_kb * 100) if total_kb > 0 else 0
        except Exception as e:
            self.logger.debug(f"Erro ao coletar disco: {e}")
        
        try:
            temp_result = subprocess.run(
                ['sysctl', '-n', 'dev.cpu.0.temperature'],
                capture_output=True, text=True, timeout=5
            )
            if temp_result.returncode == 0:
                temp_str = temp_result.stdout.strip().replace('C', '')
                result['temperature'] = float(temp_str)
        except Exception:
            pass
        
        return result
    
    def _send_to_api(self, endpoint: str, payload: Dict[str, Any]) -> bool:
        """Envia dados para a API."""
        api_endpoint = self.config.get('firewall365', 'endpoint')
        token = self.config.get('firewall365', 'bearer_token')
        verify_ssl = self.config.getboolean('firewall365', 'verify_ssl', fallback=True)
        
        if not token:
            return False
        
        url = f"{api_endpoint}/{endpoint}"
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                verify=verify_ssl,
                timeout=30
            )
            
            if response.status_code in [200, 201]:
                return True
            elif response.status_code == 403:
                self.logger.warning("Firewall aguardando aprovação")
                return False
            elif response.status_code == 401:
                self.logger.error("Token inválido ou expirado")
                return False
            else:
                self.logger.warning(f"Erro ao enviar {endpoint}: HTTP {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Erro de conexão ({endpoint}): {e}")
            return False
    
    def send_high_frequency(self, data: Dict[str, Any]) -> bool:
        """Envia telemetria de alta frequência."""
        firewall_id = self.config.get('firewall365', 'firewall_id')
        payload = {'firewallId': firewall_id, **data}
        return self._send_to_api('telemetry', payload)
    
    def send_medium_frequency(self, data: Dict[str, Any]) -> bool:
        """Envia telemetria de média frequência."""
        firewall_id = self.config.get('firewall365', 'firewall_id')
        
        success = True
        
        if data.get('interfaces'):
            payload = {'firewallId': firewall_id, 'interfaces': data['interfaces']}
            if not self._send_to_api('telemetry/interfaces', payload):
                success = False
        
        if data.get('services'):
            payload = {'firewallId': firewall_id, 'services': data['services']}
            if not self._send_to_api('telemetry/services', payload):
                success = False
        
        return success
    
    def send_low_frequency(self, data: Dict[str, Any]) -> bool:
        """Envia telemetria de baixa frequência."""
        firewall_id = self.config.get('firewall365', 'firewall_id')
        payload = {'firewallId': firewall_id, **data}
        return self._send_to_api('telemetry/system', payload)
    
    def run(self):
        """Loop principal do agente com coleta em tiers."""
        self.logger.info("Iniciando Firewall365 Agent v3.0.0")
        
        if not self.auto_register():
            self.logger.warning("Auto-registro falhou. Verifique a conectividade.")
            self.logger.info("O agente continuará tentando registrar a cada intervalo.")
        
        interval_high = self.config.getint('agent', 'interval_high', fallback=60)
        interval_medium = self.config.getint('agent', 'interval_medium', fallback=300)
        interval_low = self.config.getint('agent', 'interval_low', fallback=1800)
        
        self.logger.info(f"Intervalos: Alta={interval_high}s, Média={interval_medium}s, Baixa={interval_low}s")
        
        registration_retry = 0
        max_registration_retries = 5
        
        last_high = 0
        last_medium = 0
        last_low = 0
        
        while self.running:
            current_time = time.time()
            token = self.config.get('firewall365', 'bearer_token')
            firewall_id = self.config.get('firewall365', 'firewall_id')
            
            if not token or not firewall_id:
                if registration_retry < max_registration_retries:
                    self.logger.info(f"Tentando registro novamente ({registration_retry + 1}/{max_registration_retries})...")
                    if self.auto_register():
                        registration_retry = 0
                    else:
                        registration_retry += 1
                else:
                    self.logger.error("Máximo de tentativas de registro atingido.")
                time.sleep(60)
                continue
            
            if current_time - last_high >= interval_high:
                data = self.collect_high_frequency()
                if data:
                    success = self.send_high_frequency(data)
                    if success:
                        self.logger.info(
                            f"[HIGH] CPU={data['cpu']}% | MEM={data['memory']}% | WAN={data['wanThroughput']}Mbps"
                        )
                last_high = current_time
            
            if current_time - last_medium >= interval_medium:
                data = self.collect_medium_frequency()
                if data:
                    success = self.send_medium_frequency(data)
                    if success:
                        iface_count = len(data.get('interfaces', []))
                        svc_count = len(data.get('services', []))
                        self.logger.info(f"[MEDIUM] Interfaces={iface_count} | Serviços={svc_count}")
                last_medium = current_time
            
            if current_time - last_low >= interval_low:
                data = self.collect_low_frequency()
                if data:
                    success = self.send_low_frequency(data)
                    if success:
                        uptime_hours = round(data.get('uptime', 0) / 3600, 1)
                        disk_pct = round(data.get('diskPercent', 0), 1)
                        self.logger.info(f"[LOW] Uptime={uptime_hours}h | Disco={disk_pct}%")
                last_low = current_time
            
            time.sleep(1)
        
        self.logger.info("Agente encerrado")


def main():
    """Função principal."""
    if len(sys.argv) > 1 and sys.argv[1] == '--register-only':
        agent = Firewall365Agent()
        if agent.auto_register():
            print("Registro concluído com sucesso!")
            sys.exit(0)
        else:
            print("Falha no registro.")
            sys.exit(1)
    
    agent = Firewall365Agent()
    agent.run()


if __name__ == '__main__':
    main()
