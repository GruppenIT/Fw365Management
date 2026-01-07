#!/bin/bash

###############################################################################
# Firewall365 - Script de Troubleshooting
# 
# Use este script para diagnosticar problemas na instalação.
#
# Uso: sudo ./troubleshoot.sh
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/opt/firewall365"
DB_NAME="firewall365"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              FIREWALL365 - TROUBLESHOOTING                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 1. Verificar serviço
echo -e "${BLUE}[1/7] Verificando serviço firewall365...${NC}"
if systemctl is-active --quiet firewall365; then
    echo -e "${GREEN}  ✓ Serviço está rodando${NC}"
else
    echo -e "${RED}  ✗ Serviço NÃO está rodando${NC}"
    echo -e "${YELLOW}    Últimas linhas do log:${NC}"
    journalctl -u firewall365 -n 10 --no-pager
fi
echo ""

# 2. Verificar PostgreSQL
echo -e "${BLUE}[2/7] Verificando PostgreSQL...${NC}"
if systemctl is-active --quiet postgresql; then
    echo -e "${GREEN}  ✓ PostgreSQL está rodando${NC}"
else
    echo -e "${RED}  ✗ PostgreSQL NÃO está rodando${NC}"
fi
echo ""

# 3. Verificar banco de dados
echo -e "${BLUE}[3/7] Verificando banco de dados...${NC}"
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${GREEN}  ✓ Banco '$DB_NAME' existe${NC}"
else
    echo -e "${RED}  ✗ Banco '$DB_NAME' não encontrado${NC}"
fi
echo ""

# 4. Verificar tabelas
echo -e "${BLUE}[4/7] Verificando tabelas no banco...${NC}"
TABLES=$(sudo -u postgres psql -d $DB_NAME -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';" 2>/dev/null)
if [[ -n "$TABLES" ]]; then
    echo -e "${GREEN}  ✓ Tabelas encontradas:${NC}"
    echo "$TABLES" | while read table; do
        [[ -n "$table" ]] && echo "      - $table"
    done
else
    echo -e "${RED}  ✗ Nenhuma tabela encontrada - schema não foi aplicado${NC}"
    echo -e "${YELLOW}    Execute: cd $APP_DIR && npm run db:push${NC}"
fi
echo ""

# 5. Verificar usuário admin
echo -e "${BLUE}[5/7] Verificando usuário admin...${NC}"
ADMIN_EXISTS=$(sudo -u postgres psql -d $DB_NAME -t -c "SELECT email FROM users WHERE email = 'admin@firewall365.com';" 2>/dev/null | xargs)
if [[ "$ADMIN_EXISTS" == "admin@firewall365.com" ]]; then
    echo -e "${GREEN}  ✓ Usuário admin existe no banco${NC}"
else
    echo -e "${RED}  ✗ Usuário admin NÃO existe no banco${NC}"
    echo -e "${YELLOW}    Criando usuário admin...${NC}"
    
    # Tentar criar via reinício do serviço
    echo -e "${YELLOW}    Reiniciando serviço para criar admin...${NC}"
    systemctl restart firewall365
    sleep 5
    
    ADMIN_CHECK=$(sudo -u postgres psql -d $DB_NAME -t -c "SELECT email FROM users WHERE email = 'admin@firewall365.com';" 2>/dev/null | xargs)
    if [[ "$ADMIN_CHECK" == "admin@firewall365.com" ]]; then
        echo -e "${GREEN}  ✓ Usuário admin criado com sucesso${NC}"
    else
        echo -e "${RED}  ✗ Falha ao criar usuário admin automaticamente${NC}"
    fi
fi
echo ""

# 6. Verificar API
echo -e "${BLUE}[6/7] Verificando API...${NC}"
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/health 2>/dev/null)
if [[ "$API_STATUS" == "200" ]]; then
    echo -e "${GREEN}  ✓ API respondendo (HTTP $API_STATUS)${NC}"
else
    echo -e "${RED}  ✗ API não respondendo (HTTP $API_STATUS)${NC}"
fi
echo ""

# 7. Teste de login
echo -e "${BLUE}[7/7] Testando login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@firewall365.com","password":"admin123"}' 2>/dev/null)

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo -e "${GREEN}  ✓ Login funcionando corretamente${NC}"
else
    echo -e "${RED}  ✗ Falha no login${NC}"
    echo -e "${YELLOW}    Resposta da API: $LOGIN_RESPONSE${NC}"
fi
echo ""

# Resumo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}Logs do serviço (últimas 20 linhas):${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
journalctl -u firewall365 -n 20 --no-pager
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}Comandos úteis:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Ver logs em tempo real:  sudo journalctl -u firewall365 -f"
echo "  Reiniciar serviço:       sudo systemctl restart firewall365"
echo "  Aplicar schema do banco: cd $APP_DIR && npm run db:push"
echo "  Verificar .env:          cat $APP_DIR/.env"
echo ""
