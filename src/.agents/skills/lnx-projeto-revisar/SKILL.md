---
name: lnx-projeto-revisar
description: Analisa um projeto existente para criar/atualizar .ai/project.md, .ai/stack.md e mapear regras de negócio automaticamente. Usado quando l-nexus é instalado em um projeto já em andamento, ou via comando /lnx-projeto-revisar.
---

# Revisar Projeto (Scan & Análise Automática)

Esta skill deve ser ativada quando o l-nexus for instalado em um projeto **já existente** (com código, dependências e estrutura), ou quando o usuário solicitar revisão/análise do projeto para gerar/atualizar `project.md`, ou via comando `/lnx-projeto-revisar`.

> **Diferente de `lnx-projeto-iniciar`**: o `lnx-projeto-revisar` faz scan automático do código existente para preencher `project.md` e `stack.md`. O `lnx-projeto-iniciar` é para projetos novos onde o usuário define tudo manualmente.

## Fluxo

### Fase 1 — Garantir o Ambiente l-nexus

1. Verifique se `.ai/` existe na raiz do projeto. Se não existir, execute `npx @leo-cmp/l-nexus install` primeiro.
2. Verifique se `project.md` e `stack.md` existem em `.ai/`. Anote o estado atual para decidir se é criação ou atualização.

### Fase 2 — Scan Automático da Stack

Investigue o projeto para detectar automaticamente stacks e frameworks. Use comandos de diagnóstico conforme disponível:

**Backend (PHP):**
- `composer.json` → procure por `laravel/framework`, `codeigniter4/framework`, `slim/slim`, etc.
- Se Laravel: versão exata (`composer show laravel/framework | grep version`).
- Se CodeIgniter 4: versão exata.
- Detecte se há `artisan` (Laravel) ou `spark` (CodeIgniter).

**Backend (Node.js):**
- `package.json` → procure por frameworks: `express`, `fastify`, `koa`, `nestjs`, `next`, `nuxt`, `remix`, `astro`, `sveltekit`.
- Versão do runtime: `node --version`.

**Banco de Dados:**
- Arquivos `.env`, `docker-compose.yml`, `config/database.php` (Laravel), `app/Config/Database.php` (CI4).
- Detecte: MySQL, PostgreSQL, SQLite, MongoDB, Redis.
- Versão se disponível (ex: `mysql --version`, `psql --version`).

**Frontend:**
- `package.json` devDependencies/dependencies: `tailwindcss`, `daisyui`, `alpinejs`, `react`, `vue`, `angular`, `svelte`, `htmx`.
- Procure por `tailwind.config.*`, `postcss.config.*`, `vite.config.*`, `webpack.config.*`.
- Se `@astrojs/*` presente → Astro.
- Se `daisyui` presente → ativar skill `daisyui`.

**Ferramentas de Build/Teste:**
- PHP: `phpunit`, `pest` (pestphp/pest).
- JS: `vitest`, `jest`, `mocha`, `cypress`, `playwright`.
- Lint: `laravel/pint`, `php-cs-fixer`, `eslint`, `prettier`.

**Gerenciadores de Dependência:**
- `composer.json` + `composer.lock` → PHP/Composer.
- `package.json` + (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`) → detecte npm/yarn/pnpm/bun.
- `Cargo.toml` → Rust.
- `go.mod` → Go.
- `requirements.txt`, `pyproject.toml` → Python.

**Infraestrutura/DevOps:**
- `Dockerfile`, `docker-compose.yml` → containerização.
- `.github/workflows/` → CI/CD via GitHub Actions.

### Fase 3 — Análise Estrutural

- Liste o diretório raiz para entender a estrutura (MVC, monorepo, packages, apps).
- Identifique padrões arquiteturais:
  - Laravel: `app/Models/`, `app/Http/Controllers/`, `app/Services/`, `app/Jobs/`, `app/Events/`.
  - CI4: `app/Models/`, `app/Controllers/`, `app/Services/`, `app/Database/Migrations/`.
  - Frontend: `src/components/`, `pages/`, `layouts/`, `stores/`.
- Detecte módulos/pacotes adicionais instalados (ex: Laravel Nova, Horizon, Telescope, Livewire, Filament, Inertia).

### Fase 4 — Mapeamento de Regras de Negócio

- Procure por entidades de domínio nos Models (Eloquent entities, CI4 entities).
- Detecte regras de validação em Form Requests (Laravel), controllers, ou services.
- Identifique roles/permissões se houver (middleware de auth, policies, gates, spatie/laravel-permission).
- Procure por fluxos de negócio complexos em Services, Actions, Jobs.
- Liste as regras detectadas em `.ai/guidelines/domain/business-rules/index.md`.

### Fase 5 — Gerar/Apresentar Resultados

Apresente ao usuário um resumo do que foi detectado, organizado por seção:

```
=== REVIEW DO PROJETO ===

Stack detectada:
  Backend: Laravel 11.x (PHP 8.3)
  Frontend: Tailwind CSS 3.x + daisyUI + Alpine.js
  Database: MySQL 8.0
  Build: Vite
  Testes: Pest
  CI/CD: GitHub Actions

Estrutura:
  MVC padrão Laravel com Services e Jobs
  Atomic Design: não detectado

Regras de negócio detectadas:
  - Autenticação JWT (token refresh)
  - Políticas de acesso por role (admin, editor, user)
  - Notificações por email e websocket
  - Upload de arquivos com validação de tipo/tamanho
```

**Pergunte ao usuário:**
1. As stacks detectadas estão corretas? (permita ajustes)
2. Alguma stack adicional não detectada?
3. O projeto usa Atomic Design no frontend?
4. As regras de negócio detectadas estão completas? Quais faltam?

### Fase 6 — Escrever os Arquivos

Após aprovação do usuário, escreva:

**`.ai/project.md`:**
```markdown
# <Nome do Projeto>

> Última revisão: YYYY-MM-DD (via l-nexus review-projeto)

## Ambiente e Estrutura
- **Localização:** Os arquivos rodam diretamente na raiz.
- **Idioma da UI:** pt-BR
- **Ambiente:** <local | staging | production>
- **Repositório:** <URL do git remote>

## Stack
- **Backend:** <linguagem/framework> <versão>
- **Frontend:** <frameworks/bibliotecas>
- **Database:** <SGBD> <versão>
- **Build:** <ferramenta>
- **Testes:** <frameworks>
- **CI/CD:** <plataforma>
- **Atomic Design:** <sim/não — se sim: obrigatório (<mecanismo>)>

## Domínio e Regras de Negócio
- Link: `.ai/guidelines/domain/business-rules/index.md`
```

**`.ai/stack.md`:**
```markdown
# Stacks do Projeto

> Gerado automaticamente em YYYY-MM-DD via l-nexus review-projeto.

Consulte as diretrizes específicas em `.ai/guidelines/stacks/`:

- [x] Backend: <framework> (<diretriz>.md)
- [x] Frontend: <lista de frameworks> (consultar respectivas diretrizes)
- [x] Database: <SGBD>
- [ ] Outros: (adicionar conforme necessário)
```

**`.ai/guidelines/domain/business-rules/index.md`:**
```markdown
# Regras de Negócio

> Mapeado automaticamente em YYYY-MM-DD via l-nexus review-projeto.

## Entidades de Domínio
- <lista das models/entidades detectadas>

## Regras de Validação
- <regras detectadas em Form Requests, controllers, etc.>

## Controle de Acesso
- <roles/permissões detectadas>

## Fluxos Específicos
- <fluxos complexos detectados em Services, Jobs, Actions>

## Pendentes de Esclarecimento
- <itens que precisam de confirmação do usuário>
```

### Fase 7 — Finalizar

1. Confirme que os arquivos foram escritos corretamente.
2. Sugira: "Use `/lnx-plano-criar` para iniciar uma nova fase de desenvolvimento."
3. Atualize `session-memory.md` com o resumo do review.

## Circuit Breakers

- Se o scan encontrar MAIS de 3 stacks diferentes (ex: PHP + Node + Python + Go), PARE e pergunte ao usuário qual é a stack primária antes de continuar.
- Se nenhuma stack for detectada automaticamente, apresente as evidências e peça ao usuário para confirmar manualmente.
- Se o projeto tiver +50 Models/entidades, liste apenas as 20 principais e pergunte se deve continuar o mapeamento completo.
