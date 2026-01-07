#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Firewall365 Agent - OPNSense Telemetry Collector

Este agente coleta métricas de telemetria de dispositivos OPNSense
e envia para a plataforma central Firewall365.

O agente faz auto-registro automaticamente na primeira execução.

Autor: Firewall365
Versão: 2.0.0
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
from datetime import datetime
from typing import Dict, Any, Optional

try:
    import requests
    from requests.auth import HTTPBasicAuth
except ImportError:
    print("ERRO: Módulo 'requests' não encontrado.")
    print("Instale com: pkg install py39-requests")
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
        'interval': '60',
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
    
    def collect_telemetry(self) -> Optional[Dict[str, Any]]:
        """Coleta dados de telemetria do OPNSense."""
        telemetry = {
            'cpu': 0.0,
            'memory': 0.0,
            'wanThroughput': 0.0,
            'interfaces': {}
        }
        
        try:
            result = subprocess.run(
                ['sysctl', '-n', 'kern.cp_time'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                cpu_times = [int(x) for x in result.stdout.strip().split()]
                if len(cpu_times) >= 5:
                    idle = cpu_times[4]
                    total = sum(cpu_times)
                    telemetry['cpu'] = round((1 - idle / total) * 100, 2) if total > 0 else 0
        except Exception as e:
            self.logger.debug(f"Erro ao coletar CPU: {e}")
        
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
                    telemetry['memory'] = round((used_mem / physmem) * 100, 2) if physmem > 0 else 0
        except Exception as e:
            self.logger.debug(f"Erro ao coletar memória: {e}")
        
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
    
    def send_telemetry(self, telemetry: Dict[str, Any]) -> bool:
        """Envia telemetria para a plataforma central."""
        endpoint = self.config.get('firewall365', 'endpoint')
        token = self.config.get('firewall365', 'bearer_token')
        firewall_id = self.config.get('firewall365', 'firewall_id')
        verify_ssl = self.config.getboolean('firewall365', 'verify_ssl', fallback=True)
        
        if not token or not firewall_id:
            self.logger.error("Token ou Firewall ID não configurados")
            return False
        
        url = f"{endpoint}/telemetry"
        
        payload = {
            'firewallId': firewall_id,
            **telemetry
        }
        
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
            
            if response.status_code == 201:
                self.logger.debug("Telemetria enviada com sucesso")
                return True
            elif response.status_code == 401:
                self.logger.error("Token inválido ou expirado")
                return False
            else:
                self.logger.warning(f"Erro ao enviar telemetria: HTTP {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Erro de conexão ao enviar telemetria: {e}")
            return False
    
    def run(self):
        """Loop principal do agente."""
        self.logger.info("Iniciando Firewall365 Agent v2.0.0")
        
        if not self.auto_register():
            self.logger.warning("Auto-registro falhou. Verifique a conectividade.")
            self.logger.info("O agente continuará tentando registrar a cada intervalo.")
        
        interval = self.config.getint('agent', 'interval', fallback=60)
        self.logger.info(f"Intervalo de coleta: {interval} segundos")
        
        registration_retry = 0
        max_registration_retries = 5
        
        while self.running:
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
                    self.logger.error("Configure manualmente o bearer_token e firewall_id.")
            else:
                telemetry = self.collect_telemetry()
                if telemetry:
                    success = self.send_telemetry(telemetry)
                    if success:
                        self.logger.info(
                            f"Telemetria: CPU={telemetry['cpu']}% | "
                            f"MEM={telemetry['memory']}% | "
                            f"WAN={telemetry['wanThroughput']}Mbps"
                        )
            
            for _ in range(interval):
                if not self.running:
                    break
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
