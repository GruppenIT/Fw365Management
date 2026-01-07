#!/bin/bash

###############################################################################
# Firewall365 - Script para corrigir conexão com banco de dados
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/opt/firewall365"
DB_NAME="firewall365"
DB_USER="firewall365"

echo ""
echo -e "${BLUE}[FIX] Corrigindo conexão com banco de dados...${NC}"
echo ""

# Extrair senha do .env
if [[ -f "$APP_DIR/.env" ]]; then
    DB_PASSWORD=$(grep DATABASE_URL "$APP_DIR/.env" | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
    echo -e "${GREEN}  ✓ Senha encontrada no .env${NC}"
else
    echo -e "${RED}  ✗ Arquivo .env não encontrado${NC}"
    exit 1
fi

# Atualizar senha do usuário no PostgreSQL
echo -e "${BLUE}[FIX] Atualizando senha do usuário $DB_USER no PostgreSQL...${NC}"
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}  ✓ Senha atualizada com sucesso${NC}"
else
    echo -e "${RED}  ✗ Falha ao atualizar senha${NC}"
    exit 1
fi

# Garantir permissões
echo -e "${BLUE}[FIX] Verificando permissões do banco...${NC}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;"
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;"
echo -e "${GREEN}  ✓ Permissões configuradas${NC}"

# Aplicar schema
echo -e "${BLUE}[FIX] Aplicando schema do banco de dados...${NC}"
cd "$APP_DIR"

# Exportar DATABASE_URL
export DATABASE_URL=$(grep DATABASE_URL "$APP_DIR/.env" | cut -d'=' -f2-)

npm run db:push 2>&1 | tail -10

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}  ✓ Schema aplicado${NC}"
else
    echo -e "${RED}  ✗ Falha ao aplicar schema${NC}"
fi

# Reiniciar serviço
echo -e "${BLUE}[FIX] Reiniciando serviço...${NC}"
systemctl restart firewall365
sleep 5

if systemctl is-active --quiet firewall365; then
    echo -e "${GREEN}  ✓ Serviço reiniciado${NC}"
else
    echo -e "${RED}  ✗ Falha ao reiniciar serviço${NC}"
fi

# Verificar usuário admin
echo -e "${BLUE}[FIX] Verificando usuário admin...${NC}"
sleep 3
ADMIN_EXISTS=$(sudo -u postgres psql -d $DB_NAME -t -c "SELECT email FROM users WHERE email = 'admin@firewall365.com';" 2>/dev/null | xargs)

if [[ "$ADMIN_EXISTS" == "admin@firewall365.com" ]]; then
    echo -e "${GREEN}  ✓ Usuário admin existe${NC}"
else
    echo -e "${YELLOW}  Aguardando criação do admin...${NC}"
    sleep 5
    ADMIN_EXISTS=$(sudo -u postgres psql -d $DB_NAME -t -c "SELECT email FROM users WHERE email = 'admin@firewall365.com';" 2>/dev/null | xargs)
    if [[ "$ADMIN_EXISTS" == "admin@firewall365.com" ]]; then
        echo -e "${GREEN}  ✓ Usuário admin criado${NC}"
    else
        echo -e "${RED}  ✗ Admin não foi criado automaticamente${NC}"
    fi
fi

# Testar login
echo -e "${BLUE}[FIX] Testando login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@firewall365.com","password":"admin123"}' 2>/dev/null)

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo -e "${GREEN}  ✓ Login funcionando!${NC}"
    echo ""
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  PROBLEMA CORRIGIDO!${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Acesse: ${BLUE}https://opn.gruppen.com.br${NC}"
    echo -e "  Login:  ${YELLOW}admin@firewall365.com${NC}"
    echo -e "  Senha:  ${YELLOW}admin123${NC}"
    echo ""
else
    echo -e "${RED}  ✗ Ainda há problema no login${NC}"
    echo -e "${YELLOW}  Resposta: $LOGIN_RESPONSE${NC}"
    echo ""
    echo -e "${YELLOW}Verifique os logs: sudo journalctl -u firewall365 -n 30${NC}"
fi
