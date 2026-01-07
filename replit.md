# Firewall365

## Visão Geral
Firewall365 é uma plataforma SaaS multi-tenant para gestão centralizada de dispositivos OPNSense com telemetria em tempo real.

**URL de Produção:** `https://opn.gruppen.com.br`

## Arquitetura

### Stack Tecnológico
- **Frontend:** React 19 + TypeScript + Tailwind CSS + Shadcn/UI
- **Backend:** Node.js + Express.js
- **Banco de Dados:** PostgreSQL com Drizzle ORM
- **Autenticação:** JWT + bcrypt
- **Roteamento:** Wouter (frontend)
- **Estado:** Zustand + TanStack Query

### Estrutura do Projeto

```
firewall365/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── components/     # Componentes UI (Shadcn)
│   │   ├── hooks/          # Custom hooks (useAuth, etc)
│   │   ├── lib/            # Utilitários e API client
│   │   └── pages/          # Páginas da aplicação
│   └── index.html
├── server/                 # Backend Express
│   ├── auth.ts             # Autenticação JWT
│   ├── db.ts               # Conexão com banco
│   ├── routes.ts           # Rotas da API
│   └── storage.ts          # Interface de persistência
├── shared/                 # Código compartilhado
│   └── schema.ts           # Schemas Drizzle + Zod
├── agent/                  # Agente Python para OPNSense
│   └── agent.py
├── scripts/                # Scripts de instalação
│   └── install.sh          # Instalador Ubuntu 24.04 LTS
└── docs/                   # Documentação
    └── install_agent.md    # Guia do agente
```

## Funcionalidades Implementadas

### Autenticação
- Login com email/senha
- JWT com expiração de 7 dias
- Proteção de rotas no frontend e backend

### Multi-tenancy
- Criação de tenants (clientes)
- Isolamento de dados por tenant
- Cada usuário gerencia seus próprios tenants

### Gerenciamento de Firewalls
- Cadastro de dispositivos OPNSense
- Alocação de firewall a tenant
- Status em tempo real (online/offline)
- Geração de tokens de API para agentes

### Telemetria
- Recebimento de métricas do agente
- CPU, memória, throughput WAN
- Histórico de 24 horas com gráficos
- Atualização automática do status

## API Endpoints

### Autenticação
- `POST /api/auth/register` - Registro de usuário
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Dados do usuário autenticado

### Tenants
- `GET /api/tenants` - Listar tenants
- `POST /api/tenants` - Criar tenant
- `GET /api/tenants/:id` - Detalhe
- `PATCH /api/tenants/:id` - Atualizar
- `DELETE /api/tenants/:id` - Remover

### Firewalls
- `GET /api/firewalls` - Listar firewalls
- `POST /api/firewalls` - Criar firewall
- `GET /api/firewalls/:id` - Detalhe
- `PATCH /api/firewalls/:id` - Atualizar
- `DELETE /api/firewalls/:id` - Remover
- `POST /api/firewalls/:id/assign` - Alocar a tenant

### Telemetria
- `GET /api/telemetry/:firewallId` - Histórico
- `POST /api/telemetry` - Receber dados (agente)

### Tokens
- `POST /api/tokens` - Gerar token de API

## Credenciais de Teste

**Usuário Admin:**
- Email: `admin@firewall365.com`
- Senha: `admin123`

## Scripts de Deploy

### install.sh (Ubuntu 24.04 LTS)
Script completo para instalação em servidor Ubuntu 24.04 LTS:
- Instala Node.js 20, PostgreSQL, Nginx
- Gera certificado SSL autoassinado (10 anos)
- Configura Nginx como reverse proxy
- Cria serviço systemd

**Uso:**
```bash
sudo ./scripts/install.sh
```

### Agente OPNSense
Ver documentação completa em `docs/install_agent.md`

## Comandos de Desenvolvimento

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build

# Iniciar em produção
npm start

# Push do schema para o banco
npm run db:push
```

## Variáveis de Ambiente

```env
DATABASE_URL=postgresql://user:pass@localhost/firewall365
JWT_SECRET=sua_chave_secreta
NODE_ENV=development|production
PORT=5000
```

## Preferências de Código

- TypeScript strict mode
- Tailwind CSS para estilização
- Componentes funcionais React
- Hooks customizados para lógica reutilizável
- Validação com Zod
- Queries com TanStack Query
