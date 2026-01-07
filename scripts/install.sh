#!/bin/bash

###############################################################################
# Firewall365 - Script de Instalação para Ubuntu 20.04+
# 
# Este script instala e configura todos os componentes necessários para
# executar o Firewall365 em um servidor Ubuntu.
#
# Uso: sudo ./install.sh
###############################################################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variáveis de configuração
APP_DOMAIN="opn.gruppen.com.br"
APP_DIR="/opt/firewall365"
APP_USER="firewall365"
NODE_VERSION="20"
DB_NAME="firewall365"
DB_USER="firewall365"
DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
JWT_SECRET=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 48)
SSL_DIR="/etc/nginx/ssl"
SSL_CERT="$SSL_DIR/firewall365.crt"
SSL_KEY="$SSL_DIR/firewall365.key"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║      ███████╗██╗██████╗ ███████╗██╗    ██╗ █████╗ ██╗     ██╗║"
    echo "║      ██╔════╝██║██╔══██╗██╔════╝██║    ██║██╔══██╗██║     ██║║"
    echo "║      █████╗  ██║██████╔╝█████╗  ██║ █╗ ██║███████║██║     ██║║"
    echo "║      ██╔══╝  ██║██╔══██╗██╔══╝  ██║███╗██║██╔══██║██║     ██║║"
    echo "║      ██║     ██║██║  ██║███████╗╚███╔███╔╝██║  ██║███████╗██║║"
    echo "║      ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚═╝║"
    echo "║                        3 6 5                                 ║"
    echo "║                                                              ║"
    echo "║          Instalador para Ubuntu 20.04+                       ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Este script deve ser executado como root (sudo)"
        exit 1
    fi
}

check_ubuntu() {
    if ! grep -q "Ubuntu" /etc/os-release 2>/dev/null; then
        log_warn "Este script foi projetado para Ubuntu. Outras distribuições podem ter problemas."
    fi
}

install_prerequisites() {
    log_info "Atualizando sistema e instalando pré-requisitos..."
    
    apt-get update -qq
    apt-get upgrade -y -qq
    
    apt-get install -y -qq \
        curl \
        wget \
        git \
        gnupg \
        lsb-release \
        ca-certificates \
        apt-transport-https \
        software-properties-common \
        build-essential \
        openssl \
        ufw
    
    log_success "Pré-requisitos instalados"
}

install_nodejs() {
    log_info "Instalando Node.js v${NODE_VERSION}..."
    
    if command -v node &> /dev/null; then
        CURRENT_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$CURRENT_VERSION" -ge "$NODE_VERSION" ]]; then
            log_success "Node.js v$(node -v) já está instalado"
            return
        fi
    fi
    
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
    
    log_success "Node.js $(node -v) instalado"
    log_success "NPM $(npm -v) instalado"
}

install_postgresql() {
    log_info "Instalando PostgreSQL..."
    
    if command -v psql &> /dev/null; then
        log_success "PostgreSQL já está instalado"
    else
        apt-get install -y -qq postgresql postgresql-contrib
    fi
    
    systemctl start postgresql
    systemctl enable postgresql
    
    # Criar usuário e banco de dados
    log_info "Configurando banco de dados..."
    
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true
    
    log_success "PostgreSQL configurado"
}

install_nginx() {
    log_info "Instalando Nginx..."
    
    if command -v nginx &> /dev/null; then
        log_success "Nginx já está instalado"
    else
        apt-get install -y -qq nginx
    fi
    
    systemctl start nginx
    systemctl enable nginx
    
    log_success "Nginx instalado"
}

generate_ssl_certificate() {
    log_info "Gerando certificado SSL autoassinado (válido por 10 anos)..."
    
    mkdir -p $SSL_DIR
    
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout $SSL_KEY \
        -out $SSL_CERT \
        -subj "/CN=$APP_DOMAIN/O=Firewall365/C=BR/ST=SP/L=Sao Paulo"
    
    chmod 600 $SSL_KEY
    chmod 644 $SSL_CERT
    
    log_success "Certificado SSL gerado em $SSL_CERT"
}

configure_nginx() {
    log_info "Configurando Nginx como reverse proxy..."
    
    cat > /etc/nginx/sites-available/firewall365 << 'NGINX_CONFIG'
# Firewall365 - Nginx Configuration

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name opn.gruppen.com.br;
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name opn.gruppen.com.br;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/firewall365.crt;
    ssl_certificate_key /etc/nginx/ssl/firewall365.key;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/firewall365_access.log;
    error_log /var/log/nginx/firewall365_error.log;

    # Root location - Proxy to Node.js app
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # API endpoint with specific settings
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for API calls
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Allow large request bodies for telemetry
        client_max_body_size 10M;
    }

    # Health check endpoint
    location /api/health {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
}
NGINX_CONFIG
    
    # Enable site
    ln -sf /etc/nginx/sites-available/firewall365 /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test and reload
    nginx -t
    systemctl reload nginx
    
    log_success "Nginx configurado"
}

create_app_user() {
    log_info "Criando usuário do sistema..."
    
    if id "$APP_USER" &>/dev/null; then
        log_success "Usuário $APP_USER já existe"
    else
        useradd -r -m -d $APP_DIR -s /bin/bash $APP_USER
        log_success "Usuário $APP_USER criado"
    fi
}

setup_application() {
    log_info "Configurando aplicação..."
    
    mkdir -p $APP_DIR
    
    # Se existir repositório git, clonar. Senão, copiar arquivos locais.
    if [[ -d "/tmp/firewall365-source" ]]; then
        cp -r /tmp/firewall365-source/* $APP_DIR/
    else
        log_warn "Código fonte não encontrado. Clone manualmente para $APP_DIR"
    fi
    
    # Criar arquivo .env
    cat > $APP_DIR/.env << EOF
# Firewall365 Environment Configuration
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

# Security
JWT_SECRET=$JWT_SECRET

# Application
APP_URL=https://$APP_DOMAIN
EOF
    
    chmod 600 $APP_DIR/.env
    chown -R $APP_USER:$APP_USER $APP_DIR
    
    # Instalar dependências
    if [[ -f "$APP_DIR/package.json" ]]; then
        cd $APP_DIR
        sudo -u $APP_USER npm install --production
        sudo -u $APP_USER npm run build 2>/dev/null || true
    fi
    
    log_success "Aplicação configurada"
}

create_systemd_service() {
    log_info "Criando serviço systemd..."
    
    cat > /etc/systemd/system/firewall365.service << EOF
[Unit]
Description=Firewall365 - OPNSense Management Platform
Documentation=https://github.com/firewall365/firewall365
After=network.target postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node dist/index.cjs
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=firewall365

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable firewall365
    
    log_success "Serviço systemd criado"
}

configure_firewall() {
    log_info "Configurando firewall (UFW)..."
    
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    
    log_success "Firewall configurado"
}

print_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              INSTALAÇÃO CONCLUÍDA COM SUCESSO!               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${GREEN}Informações de Acesso:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  URL:              ${BLUE}https://$APP_DOMAIN${NC}"
    echo -e "  Diretório App:    ${BLUE}$APP_DIR${NC}"
    echo ""
    echo -e "${GREEN}Banco de Dados:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Host:             localhost"
    echo -e "  Database:         $DB_NAME"
    echo -e "  Usuário:          $DB_USER"
    echo -e "  Senha:            ${YELLOW}$DB_PASSWORD${NC}"
    echo ""
    echo -e "${GREEN}Certificado SSL:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Certificado:      $SSL_CERT"
    echo -e "  Chave:            $SSL_KEY"
    echo -e "  Validade:         10 anos"
    echo ""
    echo -e "${GREEN}Comandos Úteis:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Iniciar:          ${BLUE}sudo systemctl start firewall365${NC}"
    echo -e "  Parar:            ${BLUE}sudo systemctl stop firewall365${NC}"
    echo -e "  Status:           ${BLUE}sudo systemctl status firewall365${NC}"
    echo -e "  Logs:             ${BLUE}sudo journalctl -u firewall365 -f${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANTE:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  1. Configure o DNS de $APP_DOMAIN para este servidor"
    echo "  2. Copie o código da aplicação para $APP_DIR"
    echo "  3. Execute: cd $APP_DIR && npm install && npm run build"
    echo "  4. Inicie: sudo systemctl start firewall365"
    echo ""
    echo "  Guarde as credenciais do banco de dados em local seguro!"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    print_banner
    check_root
    check_ubuntu
    
    log_info "Iniciando instalação do Firewall365..."
    echo ""
    
    install_prerequisites
    install_nodejs
    install_postgresql
    install_nginx
    generate_ssl_certificate
    configure_nginx
    create_app_user
    setup_application
    create_systemd_service
    configure_firewall
    
    print_summary
}

main "$@"
