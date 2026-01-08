#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Firewall365 Agent - WebSocket Tunnel Module

Este modulo mantem conexao WebSocket persistente com o servidor central
e faz bridge para SSH local quando solicitado usando PTY real.

Autor: Firewall365
Versao: 2.0.0
Licenca: MIT
"""

import os
import sys
import json
import time
import pty
import signal
import logging
import threading
import subprocess
import configparser
import base64
from typing import Dict, Optional, Any

try:
    import websocket
except ImportError:
    print("ERRO: Modulo 'websocket-client' nao encontrado.")
    print("Instale com: python3 -m pip install websocket-client")
    sys.exit(1)

CONFIG_PATH = '/etc/firewall365/agent.conf'


class SSHSession:
    """Gerencia uma sessao SSH usando PTY real."""
    
    def __init__(self, session_id: str, username: str, password: str, 
                 on_data: callable, on_close: callable, logger: logging.Logger):
        self.session_id = session_id
        self.username = username
        self.password = password
        self.on_data = on_data
        self.on_close = on_close
        self.logger = logger
        self.master_fd: Optional[int] = None
        self.pid: Optional[int] = None
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.password_sent = False
    
    def connect(self) -> bool:
        """Inicia sessao SSH com PTY."""
        try:
            self.pid, self.master_fd = pty.fork()
            
            if self.pid == 0:
                os.execvp('ssh', [
                    'ssh',
                    '-o', 'StrictHostKeyChecking=no',
                    '-o', 'UserKnownHostsFile=/dev/null',
                    '-o', 'PreferredAuthentications=password,keyboard-interactive',
                    '-o', 'PubkeyAuthentication=no',
                    '-o', 'NumberOfPasswordPrompts=1',
                    f'{self.username}@127.0.0.1'
                ])
            
            self.running = True
            self.thread = threading.Thread(target=self._read_loop, daemon=True)
            self.thread.start()
            
            self.logger.info(f"[SSH] Sessao {self.session_id[:8]} iniciada para {self.username}@127.0.0.1")
            return True
            
        except Exception as e:
            self.logger.error(f"[SSH] Erro ao iniciar PTY: {e}")
            return False
    
    def _read_loop(self):
        """Loop de leitura do PTY."""
        import select
        
        while self.running and self.master_fd is not None:
            try:
                readable, _, _ = select.select([self.master_fd], [], [], 0.1)
                if readable:
                    try:
                        data = os.read(self.master_fd, 4096)
                        if data:
                            if not self.password_sent and (b'assword:' in data or b'assword for' in data):
                                time.sleep(0.1)
                                os.write(self.master_fd, (self.password + '\n').encode())
                                self.password_sent = True
                                self.on_data(self.session_id, data)
                            else:
                                self.on_data(self.session_id, data)
                        else:
                            self.running = False
                            break
                    except OSError as e:
                        if e.errno == 5:
                            self.running = False
                            break
                        raise
            except Exception as e:
                self.logger.debug(f"[SSH] Erro na leitura: {e}")
                self.running = False
                break
        
        self.on_close(self.session_id)
    
    def send(self, data: bytes):
        """Envia dados para o SSH."""
        if self.master_fd is not None and self.running:
            try:
                os.write(self.master_fd, data)
            except Exception as e:
                self.logger.error(f"[SSH] Erro ao enviar: {e}")
                self.close()
    
    def resize(self, rows: int, cols: int):
        """Redimensiona o terminal."""
        if self.master_fd is not None:
            try:
                import struct
                import fcntl
                import termios
                winsize = struct.pack('HHHH', rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except Exception as e:
                self.logger.debug(f"[SSH] Erro ao redimensionar: {e}")
    
    def close(self):
        """Fecha a sessao SSH."""
        self.running = False
        
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except:
                pass
            self.master_fd = None
        
        if self.pid is not None:
            try:
                os.kill(self.pid, signal.SIGTERM)
                os.waitpid(self.pid, os.WNOHANG)
            except:
                pass
            self.pid = None
        
        self.logger.info(f"[SSH] Sessao {self.session_id[:8]} encerrada")


class TunnelClient:
    """Cliente de tunel WebSocket para o servidor central."""
    
    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self.config = self._load_config()
        self._setup_logging()
        self.running = True
        self.ws: Optional[websocket.WebSocketApp] = None
        self.ssh_sessions: Dict[str, SSHSession] = {}
        self.reconnect_delay = 5
        self.max_reconnect_delay = 60
    
    def _load_config(self) -> configparser.ConfigParser:
        """Carrega configuracao."""
        config = configparser.ConfigParser()
        if os.path.exists(self.config_path):
            config.read(self.config_path)
        return config
    
    def _setup_logging(self):
        """Configura logging."""
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
        self.logger = logging.getLogger('firewall365-tunnel')
    
    def _get_ws_url(self) -> str:
        """Constroi URL do WebSocket."""
        endpoint = self.config.get('firewall365', 'endpoint', fallback='https://opn.gruppen.com.br/api')
        token = self.config.get('firewall365', 'bearer_token', fallback='')
        
        ws_base = endpoint.replace('https://', 'wss://').replace('http://', 'ws://')
        ws_base = ws_base.replace('/api', '')
        
        return f"{ws_base}/ws?type=agent&token={token}"
    
    def _on_message(self, ws, message: str):
        """Processa mensagem do servidor."""
        try:
            msg = json.loads(message)
            msg_type = msg.get('type')
            
            if msg_type == 'connected':
                self.logger.info(f"[TUNNEL] Conectado ao servidor")
                self.reconnect_delay = 5
            
            elif msg_type == 'ssh_open':
                session_id = msg.get('sessionId')
                username = msg.get('username', 'root')
                password = msg.get('password', '')
                self._open_ssh_session(session_id, username, password)
            
            elif msg_type == 'ssh_data':
                session_id = msg.get('sessionId')
                data = msg.get('data', '')
                if session_id in self.ssh_sessions:
                    raw_data = base64.b64decode(data)
                    self.ssh_sessions[session_id].send(raw_data)
            
            elif msg_type == 'ssh_resize':
                session_id = msg.get('sessionId')
                rows = msg.get('rows', 24)
                cols = msg.get('cols', 80)
                if session_id in self.ssh_sessions:
                    self.ssh_sessions[session_id].resize(rows, cols)
            
            elif msg_type == 'ssh_close':
                session_id = msg.get('sessionId')
                if session_id in self.ssh_sessions:
                    self.ssh_sessions[session_id].close()
                    del self.ssh_sessions[session_id]
            
            elif msg_type == 'ping':
                ws.send(json.dumps({'type': 'pong'}))
        
        except Exception as e:
            self.logger.error(f"[TUNNEL] Erro ao processar mensagem: {e}")
    
    def _open_ssh_session(self, session_id: str, username: str, password: str):
        """Abre uma nova sessao SSH."""
        if session_id in self.ssh_sessions:
            self.logger.warning(f"[SSH] Sessao {session_id[:8]} ja existe")
            return
        
        session = SSHSession(
            session_id=session_id,
            username=username,
            password=password,
            on_data=self._ssh_data_callback,
            on_close=self._ssh_close_callback,
            logger=self.logger
        )
        
        if session.connect():
            self.ssh_sessions[session_id] = session
        else:
            self._send_message({
                'type': 'ssh_error',
                'sessionId': session_id,
                'error': 'Failed to start SSH session'
            })
    
    def _ssh_data_callback(self, session_id: str, data: bytes):
        """Callback quando ha dados do SSH."""
        self._send_message({
            'type': 'ssh_data',
            'sessionId': session_id,
            'data': base64.b64encode(data).decode('utf-8')
        })
    
    def _ssh_close_callback(self, session_id: str):
        """Callback quando a sessao SSH fecha."""
        self._send_message({
            'type': 'ssh_closed',
            'sessionId': session_id
        })
        if session_id in self.ssh_sessions:
            del self.ssh_sessions[session_id]
    
    def _send_message(self, msg: dict):
        """Envia mensagem ao servidor."""
        if self.ws:
            try:
                self.ws.send(json.dumps(msg))
            except Exception as e:
                self.logger.error(f"[TUNNEL] Erro ao enviar: {e}")
    
    def _on_error(self, ws, error):
        """Handler de erro."""
        self.logger.error(f"[TUNNEL] Erro WebSocket: {error}")
    
    def _on_close(self, ws, close_status_code, close_msg):
        """Handler de fechamento."""
        self.logger.warning(f"[TUNNEL] Conexao fechada: {close_status_code} - {close_msg}")
        for session in list(self.ssh_sessions.values()):
            session.close()
        self.ssh_sessions.clear()
    
    def _on_open(self, ws):
        """Handler de abertura."""
        self.logger.info("[TUNNEL] WebSocket conectado")
    
    def run(self):
        """Loop principal do tunel."""
        self.logger.info("[TUNNEL] Iniciando Firewall365 Tunnel v2.0.0")
        
        token = self.config.get('firewall365', 'bearer_token', fallback='')
        if not token:
            self.logger.error("[TUNNEL] Token nao configurado. Execute o agente principal primeiro.")
            return
        
        verify_ssl = self.config.getboolean('firewall365', 'verify_ssl', fallback=True)
        
        while self.running:
            try:
                ws_url = self._get_ws_url()
                self.logger.info(f"[TUNNEL] Conectando a {ws_url[:50]}...")
                
                sslopt = {} if verify_ssl else {"cert_reqs": 0, "check_hostname": False}
                
                self.ws = websocket.WebSocketApp(
                    ws_url,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                    on_open=self._on_open
                )
                
                self.ws.run_forever(sslopt=sslopt, ping_interval=30, ping_timeout=10)
                
            except Exception as e:
                self.logger.error(f"[TUNNEL] Excecao: {e}")
            
            if self.running:
                self.logger.info(f"[TUNNEL] Reconectando em {self.reconnect_delay}s...")
                time.sleep(self.reconnect_delay)
                self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
        
        self.logger.info("[TUNNEL] Encerrado")
    
    def stop(self):
        """Para o tunel."""
        self.running = False
        if self.ws:
            self.ws.close()


def main():
    """Funcao principal."""
    client = TunnelClient()
    
    def signal_handler(signum, frame):
        print("\nEncerrando tunel...")
        client.stop()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    client.run()


if __name__ == '__main__':
    main()
