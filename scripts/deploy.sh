#!/bin/bash

###############################################################################
# Firewall365 - Script de Deploy para Ubuntu 24.04 LTS
# 
# Execute este script APÓS o install.sh para fazer deploy do código.
# O código deve estar em /tmp/firewall365-source ou será baixado.
#
# Uso: sudo ./deploy.sh
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/opt/firewall365"
APP_USER="firewall365"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Execute como root: sudo ./deploy.sh"
        exit 1
    fi
}

deploy_code() {
    log_info "Fazendo deploy do código..."
    
    cd $APP_DIR
    
    if [[ ! -f "package.json" ]]; then
        log_error "package.json não encontrado em $APP_DIR"
        log_info "Copie o código fonte para $APP_DIR antes de executar este script"
        log_info "Exemplo: scp -r ./* root@servidor:/opt/firewall365/"
        exit 1
    fi
    
    log_info "Instalando dependências..."
    sudo -u $APP_USER npm install
    
    log_info "Fazendo build da aplicação..."
    sudo -u $APP_USER npm run build
    
    log_info "Aplicando migrations do banco de dados..."
    sudo -u $APP_USER npm run db:push
    
    log_success "Deploy concluído"
}

start_service() {
    log_info "Iniciando serviço..."
    
    systemctl daemon-reload
    systemctl restart firewall365
    
    sleep 3
    
    if systemctl is-active --quiet firewall365; then
        log_success "Serviço firewall365 está rodando"
    else
        log_error "Falha ao iniciar o serviço. Verifique os logs:"
        log_info "sudo journalctl -u firewall365 -n 50"
        exit 1
    fi
}

check_health() {
    log_info "Verificando aplicação..."
    
    sleep 2
    
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/health | grep -q "200"; then
        log_success "API respondendo corretamente"
    else
        log_warn "API pode estar iniciando. Aguarde alguns segundos..."
    fi
}

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              FIREWALL365 - DEPLOY                            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    check_root
    deploy_code
    start_service
    check_health
    
    echo ""
    echo -e "${GREEN}Deploy concluído com sucesso!${NC}"
    echo ""
    echo -e "Acesse: ${BLUE}https://opn.gruppen.com.br${NC}"
    echo -e "Login padrão: ${YELLOW}admin@firewall365.com / admin123${NC}"
    echo ""
}

main "$@"
