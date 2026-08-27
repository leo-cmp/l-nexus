---
name: lnx-projeto-iniciar
description: Inicializa um projeto configurando as diretrizes locais em .ai/, incluindo o project.md, stack.md e estruturando as regras de negócio.
disable-model-invocation: false
---

# Iniciar Projeto

Esta skill deve ser ativada quando o usuário solicitar a inicialização ou configuração de um novo projeto, ou via comando `/lnx-projeto-iniciar`.

## Fluxo

1. **Investigar o ambiente:**
   - Liste o diretório raiz do projeto para identificar a stack, frameworks, gerenciadores de dependência e banco de dados.
   - Execute comandos de diagnóstico se necessário (ex: `composer show`, `npm list`) para entender as versões exatas instaladas.

2. **Gerar ou Atualizar Configurações Locais:**
   - Garanta que a pasta `.ai/` exista na raiz do projeto principal.
   - Escreva ou atualize `.ai/project.md` com a descrição do projeto, idioma da UI (pt-BR por padrão), ambiente, repositório oficial e link para regras de negócio.
   - Escreva ou atualize `.ai/stack.md` listando as linguagens, frameworks e indicando as diretrizes globais daquela stack (ex: `laravel.md`).
   - Pergunte ao usuário se o frontend do projeto vai seguir Atomic Design (componentização estrita — ex: View Cells, componentes React/Vue, Blade components). Se sim, adicione em `.ai/project.md` § `Stack` o bullet `- **Atomic Design:** obrigatório (<mecanismo de componentização da stack>)` — isso ativa `.ai/guidelines/core/atomic-design.md` automaticamente para `criar-task` e `executar-task`. Se não, não adicione o bullet.

3. **Mapear Regras de Negócio Iniciais:**
   - Crie o diretório `.ai/guidelines/domain/business-rules/`.
   - Crie um arquivo inicial em `.ai/guidelines/domain/business-rules/index.md` listando as regras comerciais conhecidas ou pendentes de alinhamento com o usuário.

4. **Verificar Instalação do l-nexus:**
   - Execute `npx @leo-cmp/l-nexus install` (ou `npx @leo-cmp/l-nexus update` para atualização limpa) para garantir que todos os arquivos de agentes e diretrizes estejam presentes na raiz do projeto.
