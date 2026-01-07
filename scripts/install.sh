#!/bin/bash

###############################################################################
# Firewall365 - Script de Instalação Completa para Ubuntu 24.04 LTS
# 
# Instalador hard-reset: remove instalação anterior e instala do zero.
#
# Uso: curl -fsSL https://raw.githubusercontent.com/GruppenIT/Fw365Management/main/scripts/install.sh | sudo bash
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
GITHUB_REPO="https://github.com/GruppenIT/Fw365Management.git"
GITHUB_BRANCH="main"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

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
    echo "║          Instalador para Ubuntu 24.04 LTS                    ║"
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
        log_error "Este script foi projetado para Ubuntu. Outras distribuições não são suportadas."
        exit 1
    fi
    
    UBUNTU_VERSION=$(grep VERSION_ID /etc/os-release | cut -d'"' -f2)
    if [[ "$UBUNTU_VERSION" != "24.04" ]]; then
        log_warn "Ubuntu $UBUNTU_VERSION detectado. Recomendado: Ubuntu 24.04 LTS"
    else
        log_success "Ubuntu 24.04 LTS detectado"
    fi
}

cleanup_previous() {
    log_info "Limpando instalação anterior..."
    
    systemctl stop firewall365 2>/dev/null || true
    systemctl disable firewall365 2>/dev/null || true
    rm -f /etc/systemd/system/firewall365.service
    systemctl daemon-reload
    
    rm -rf "$APP_DIR"
    
    if id "$APP_USER" &>/dev/null; then
        userdel -r "$APP_USER" 2>/dev/null || true
    fi
    
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
    sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;" 2>/dev/null || true
    
    log_success "Limpeza concluída"
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
}

install_postgresql() {
    log_info "Instalando PostgreSQL..."
    
    if ! command -v psql &> /dev/null; then
        apt-get install -y -qq postgresql postgresql-contrib
    fi
    
    systemctl start postgresql
    systemctl enable postgresql
    
    log_info "Criando banco de dados..."
    
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null
    sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;" 2>/dev/null
    sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;" 2>/dev/null
    sudo -u postgres psql -d $DB_NAME -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;" 2>/dev/null
    sudo -u postgres psql -d $DB_NAME -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;" 2>/dev/null
    
    log_success "PostgreSQL configurado"
}

install_nginx() {
    log_info "Instalando Nginx..."
    
    if ! command -v nginx &> /dev/null; then
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
    
    log_success "Certificado SSL gerado"
}

configure_nginx() {
    log_info "Configurando Nginx..."
    
    cat > /etc/nginx/sites-available/firewall365 << NGINX_CONFIG
server {
    listen 80;
    listen [::]:80;
    server_name $APP_DOMAIN _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $APP_DOMAIN _;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/firewall365_access.log;
    error_log /var/log/nginx/firewall365_error.log;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        client_max_body_size 10M;
    }
}
NGINX_CONFIG
    
    ln -sf /etc/nginx/sites-available/firewall365 /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    nginx -t
    systemctl reload nginx
    
    log_success "Nginx configurado"
}

clone_repository() {
    log_info "Baixando código fonte..."
    
    cd /tmp
    git clone --depth 1 --branch "$GITHUB_BRANCH" "$GITHUB_REPO" "$APP_DIR"
    
    log_success "Código fonte baixado"
}

create_app_user() {
    log_info "Criando usuário do sistema..."
    
    useradd -r -m -d /home/$APP_USER -s /bin/bash $APP_USER
    
    log_success "Usuário $APP_USER criado"
}

setup_environment() {
    log_info "Configurando variáveis de ambiente..."
    
    cat > $APP_DIR/.env << EOF
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
JWT_SECRET=$JWT_SECRET
APP_URL=https://$APP_DOMAIN
EOF
    
    chmod 600 $APP_DIR/.env
    chown -R $APP_USER:$APP_USER $APP_DIR
    
    log_success "Ambiente configurado"
}

build_application() {
    log_info "Instalando dependências (pode demorar alguns minutos)..."
    
    cd "$APP_DIR"
    sudo -u $APP_USER npm install 2>&1 | tail -3
    
    log_success "Dependências instaladas"
    
    log_info "Fazendo build..."
    sudo -u $APP_USER npm run build 2>&1 | tail -3
    
    log_success "Build concluído"
}

setup_database_schema() {
    log_info "Aplicando schema do banco de dados..."
    
    cd "$APP_DIR"
    
    sudo -u $APP_USER bash -c "export DATABASE_URL='postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME' && npm run db:push" 2>&1 | tail -5
    
    log_success "Schema aplicado"
}

create_systemd_service() {
    log_info "Criando serviço systemd..."
    
    cat > /etc/systemd/system/firewall365.service << EOF
[Unit]
Description=Firewall365 - OPNSense Management Platform
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
StandardOutput=journal
StandardError=journal
SyslogIdentifier=firewall365

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
    
    log_success "Serviço criado"
}

start_application() {
    log_info "Iniciando aplicação..."
    
    systemctl start firewall365
    
    sleep 8
    
    if systemctl is-active --quiet firewall365; then
        log_success "Aplicação iniciada"
    else
        log_error "Falha ao iniciar. Verifique: journalctl -u firewall365 -n 50"
        exit 1
    fi
}

verify_installation() {
    log_info "Verificando instalação..."
    
    sleep 3
    
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/health 2>/dev/null)
    if [[ "$API_STATUS" == "200" ]]; then
        log_success "API respondendo"
    else
        log_warn "API ainda iniciando..."
        sleep 5
    fi
    
    ADMIN_EXISTS=$(sudo -u postgres psql -d $DB_NAME -t -c "SELECT email FROM users WHERE email = 'admin@firewall365.com';" 2>/dev/null | xargs)
    if [[ "$ADMIN_EXISTS" == "admin@firewall365.com" ]]; then
        log_success "Usuário admin criado"
    else
        log_warn "Aguardando criação do admin..."
        sleep 5
        systemctl restart firewall365
        sleep 5
    fi
    
    LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@firewall365.com","password":"admin123"}' 2>/dev/null)
    
    if echo "$LOGIN_RESPONSE" | grep -q "token"; then
        log_success "Login funcionando"
    else
        log_error "Problema no login: $LOGIN_RESPONSE"
    fi
}

configure_firewall() {
    log_info "Configurando firewall (UFW)..."
    
    ufw --force reset >/dev/null 2>&1
    ufw default deny incoming >/dev/null 2>&1
    ufw default allow outgoing >/dev/null 2>&1
    ufw allow ssh >/dev/null 2>&1
    ufw allow 80/tcp >/dev/null 2>&1
    ufw allow 443/tcp >/dev/null 2>&1
    ufw --force enable >/dev/null 2>&1
    
    log_success "Firewall configurado"
}

print_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              INSTALAÇÃO CONCLUÍDA COM SUCESSO!               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${GREEN}Acesso à Aplicação:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  URL:              ${BLUE}https://$APP_DOMAIN${NC}"
    echo -e "  Login:            ${YELLOW}admin@firewall365.com${NC}"
    echo -e "  Senha:            ${YELLOW}admin123${NC}"
    echo ""
    echo -e "${GREEN}Banco de Dados:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Database:         $DB_NAME"
    echo -e "  Usuário:          $DB_USER"
    echo -e "  Senha:            ${YELLOW}$DB_PASSWORD${NC}"
    echo ""
    echo -e "${GREEN}Comandos Úteis:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Status:           ${BLUE}sudo systemctl status firewall365${NC}"
    echo -e "  Logs:             ${BLUE}sudo journalctl -u firewall365 -f${NC}"
    echo -e "  Reiniciar:        ${BLUE}sudo systemctl restart firewall365${NC}"
    echo ""
}

main() {
    print_banner
    check_root
    check_ubuntu
    
    log_info "Iniciando instalação completa..."
    echo ""
    
    cleanup_previous
    install_prerequisites
    install_nodejs
    install_postgresql
    install_nginx
    generate_ssl_certificate
    configure_nginx
    clone_repository
    create_app_user
    setup_environment
    build_application
    setup_database_schema
    create_systemd_service
    configure_firewall
    start_application
    verify_installation
    
    print_summary
}

main "$@"
