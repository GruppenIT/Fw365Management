# Firewall365 - Guia de Instalação do Agente

## Visão Geral

Este documento descreve o processo de instalação e configuração do agente Firewall365 em dispositivos OPNSense/FreeBSD. O agente v2.0.0 inclui **auto-registro automático** - basta instalar e o firewall aparecerá na console para aprovação.

---

## Fluxo Simplificado

1. **Instale o agente** no OPNSense
2. **O agente se registra automaticamente** na plataforma
3. **Aprove o firewall** na console e associe a um tenant
4. **Pronto!** O agente começa a enviar telemetria

---

## Pré-requisitos

### Requisitos do Sistema
- OPNSense 21.1+ ou FreeBSD 12+
- Acesso SSH ao dispositivo com privilégios de root
- Conectividade HTTPS com `opn.gruppen.com.br`

---

## Seção 1: Gerar API Key no OPNSense

Antes de instalar o agente, você precisa criar credenciais de API no OPNSense para que o agente possa coletar dados locais.

### Passo 1.1: Acessar a Interface Web

1. Abra o navegador e acesse a interface web do OPNSense
2. Faça login com suas credenciais de administrador

### Passo 1.2: Criar Usuário de API

1. Navegue até: **System → Access → Users**
2. Clique em **Add** para criar um novo usuário
3. Preencha os campos:
   - **Username:** `firewall365_agent`
   - **Password:** (gere uma senha forte)
   - **Full Name:** Firewall365 Agent
   - **Login shell:** `Default (none for all but root)` - Este usuário é apenas para API, não precisa de shell
4. Marque a opção **Generate a scrambled password** (recomendado)
5. Clique em **Save**

### Passo 1.3: Gerar Chaves de API

1. Na lista de usuários, clique no ícone de **+** ao lado do usuário criado
2. Na seção **API keys**, clique em **Create API Key**
3. **IMPORTANTE:** Salve imediatamente as credenciais exibidas:
   - **API Key:** (anote este valor)
   - **API Secret:** (anote este valor - só é exibido uma vez!)
4. Guarde essas credenciais em local seguro

### Passo 1.4: Configurar Permissões

1. Navegue até: **System → Access → Groups**
2. Crie um grupo `api_readonly` ou use um existente
3. Adicione o usuário `firewall365_agent` ao grupo
4. Configure as permissões mínimas necessárias:
   - Diagnostics: System Activity
   - Diagnostics: Traffic Graph
   - Status: Dashboard (widgets)
   - Status: Interfaces

---

## Seção 2: Instalação do Agente

### Passo 2.1: Conectar via SSH

```bash
ssh root@<ip-do-opnsense>
```

### Passo 2.2: Instalar Dependências

```bash
# Instalar Python 3.11 e requests
pkg install -y python311 py311-requests

# Verificar instalação
python3 --version
python3 -c "import requests; print('requests OK')"
```

### Passo 2.3: Criar Diretórios

```bash
# Criar diretório de configuração
mkdir -p /etc/firewall365

# Criar diretório de logs
mkdir -p /var/log/firewall365

# Definir permissões
chmod 700 /etc/firewall365
chmod 755 /var/log/firewall365
```

### Passo 2.4: Baixar o Script do Agente

```bash
# Download direto
curl -o /usr/local/bin/firewall365-agent https://opn.gruppen.com.br/agent/agent.py
chmod +x /usr/local/bin/firewall365-agent
```

### Passo 2.5: Configurar Credenciais do OPNSense

Crie o arquivo de configuração com as credenciais da API local:

```bash
cat > /etc/firewall365/agent.conf << 'EOF'
[opnsense]
# URL da API local do OPNSense
api_url = https://127.0.0.1/api

# Credenciais de API do OPNSense (geradas na Seção 1)
api_key = SUA_API_KEY_AQUI
api_secret = SEU_API_SECRET_AQUI

# Verificar certificado SSL local (false para self-signed)
verify_ssl = false

[firewall365]
# Endpoint da API central
endpoint = https://opn.gruppen.com.br/api

# Token e ID serão preenchidos automaticamente pelo auto-registro
bearer_token = 
firewall_id = 

# Verificar certificado SSL (true para produção)
verify_ssl = true

[agent]
# Intervalo de coleta em segundos
interval = 60

# Nível de log (DEBUG, INFO, WARNING, ERROR)
log_level = INFO

# Arquivo de log
log_file = /var/log/firewall365/agent.log
EOF
```

Edite o arquivo para inserir suas credenciais do OPNSense:

```bash
ee /etc/firewall365/agent.conf
# Substitua SUA_API_KEY_AQUI e SEU_API_SECRET_AQUI
```

Defina permissões seguras:

```bash
chmod 600 /etc/firewall365/agent.conf
```

---

## Seção 3: Configurar Serviço de Inicialização

### Passo 3.1: Criar Script RC

```bash
cat > /usr/local/etc/rc.d/firewall365_agent << 'EOF'
#!/bin/sh

# PROVIDE: firewall365_agent
# REQUIRE: NETWORKING
# KEYWORD: shutdown

. /etc/rc.subr

name="firewall365_agent"
rcvar="firewall365_agent_enable"
command="/usr/local/bin/python3.11"
command_args="/usr/local/bin/firewall365-agent"
pidfile="/var/run/${name}.pid"

start_cmd="${name}_start"
stop_cmd="${name}_stop"
status_cmd="${name}_status"

firewall365_agent_start() {
    echo "Starting ${name}..."
    /usr/sbin/daemon -p ${pidfile} -u root ${command} ${command_args}
}

firewall365_agent_stop() {
    if [ -f ${pidfile} ]; then
        echo "Stopping ${name}..."
        kill $(cat ${pidfile}) 2>/dev/null
        rm -f ${pidfile}
    else
        echo "${name} is not running."
    fi
}

firewall365_agent_status() {
    if [ -f ${pidfile} ] && kill -0 $(cat ${pidfile}) 2>/dev/null; then
        echo "${name} is running as pid $(cat ${pidfile})."
    else
        echo "${name} is not running."
        return 1
    fi
}

load_rc_config $name
run_rc_command "$1"
EOF
```

### Passo 3.2: Configurar Permissões e Habilitar

```bash
# Tornar executável
chmod +x /usr/local/etc/rc.d/firewall365_agent

# Habilitar no boot
sysrc firewall365_agent_enable=YES

# Iniciar o serviço
service firewall365_agent start
```

---

## Seção 4: Aprovar Firewall na Console

Após iniciar o agente, ele se registrará automaticamente na plataforma.

### Passo 4.1: Acessar a Console

1. Acesse `https://opn.gruppen.com.br`
2. Faça login com suas credenciais de administrador

### Passo 4.2: Aprovar o Firewall

1. No menu lateral, clique em **Firewalls**
2. Na seção **Aguardando Aprovação**, você verá o novo firewall
3. Clique em **Aprovar**
4. No diálogo:
   - Verifique as informações do firewall (hostname, serial, IP)
   - Opcionalmente, altere o nome do firewall
   - **Selecione o Tenant** ao qual o firewall pertence
5. Clique em **Aprovar**

O firewall agora estará ativo e começará a enviar telemetria.

---

## Seção 5: Validação

### Passo 5.1: Verificar Status do Serviço

```bash
service firewall365_agent status
```

Saída esperada:
```
firewall365_agent is running as pid 12345.
```

### Passo 5.2: Verificar Logs

```bash
tail -f /var/log/firewall365/agent.log
```

Saída esperada após aprovação:
```
2024-01-15 10:30:00 [INFO] Iniciando Firewall365 Agent v2.0.0
2024-01-15 10:30:01 [INFO] Firewall registrado com sucesso!
2024-01-15 10:30:01 [INFO] Firewall ID: abc123-def456
2024-01-15 10:30:01 [INFO] Status: pending
2024-01-15 10:30:01 [INFO] Nota: Firewall is pending approval...
2024-01-15 10:31:00 [INFO] Telemetria: CPU=15% | MEM=42% | WAN=125Mbps
```

### Passo 5.3: Verificar Conectividade

```bash
# Testar conexão com a API central
curl -k -I https://opn.gruppen.com.br/api/health
```

### Passo 5.4: Verificar na Console

1. Acesse `https://opn.gruppen.com.br`
2. Vá para **Firewalls**
3. Localize seu firewall na lista
4. Verifique:
   - Status deve mostrar **Online**
   - Última atualização deve mostrar "Agora mesmo"
5. Clique em **Ver Telemetria** para visualizar os gráficos

---

## Seção 6: Troubleshooting

### Problema: Agente não inicia

```bash
# Verificar logs de erro
cat /var/log/firewall365/agent.log

# Testar execução manual
python3 /usr/local/bin/firewall365-agent
```

### Problema: Auto-registro falha

1. Verifique conectividade com a plataforma:
```bash
curl -k https://opn.gruppen.com.br/api/health
```

2. Verifique os logs para mensagens de erro específicas

3. Se o firewall já foi registrado anteriormente, delete-o na console e reinicie o agente

### Problema: Erro de conexão com API local

```bash
# Verificar se API do OPNSense está ativa
curl -k https://127.0.0.1/api/core/firmware/status

# Verificar credenciais
curl -k -u "API_KEY:API_SECRET" https://127.0.0.1/api/core/system/status
```

### Problema: Certificado SSL inválido

```bash
# Para ambiente de teste, desabilite verificação SSL
# No agent.conf, defina:
verify_ssl = false
```

---

## Seção 7: Atualizações

### Atualizar o Agente

```bash
# Parar o serviço
service firewall365_agent stop

# Baixar nova versão
curl -o /usr/local/bin/firewall365-agent https://opn.gruppen.com.br/agent/agent.py

# Reiniciar
service firewall365_agent start
```

---

## Seção 8: Desinstalação

```bash
# Parar e desabilitar serviço
service firewall365_agent stop
sysrc -x firewall365_agent_enable

# Remover arquivos
rm -f /usr/local/bin/firewall365-agent
rm -f /usr/local/etc/rc.d/firewall365_agent
rm -rf /etc/firewall365
rm -rf /var/log/firewall365
```

---

## Suporte

Em caso de problemas:
- Consulte os logs em `/var/log/firewall365/agent.log`
- Acesse a documentação completa em `https://opn.gruppen.com.br/docs`
- Entre em contato com o suporte técnico

---

*Documento atualizado em: Janeiro 2026*
*Versão do Agente: 2.0.0*
