# Environment Guidelines

- Consulte `.ai/project.md` para saber o ambiente local do projeto (Docker ou host) e o servidor de desenvolvimento.
- Nao assuma Docker por padrao. Use Docker apenas se `.ai/project.md` indicar ou se o humano pedir explicitamente.
- Comandos especificos de cada stack (CLI do framework, gerenciador de pacotes, etc.) estao em `.ai/guidelines/stacks/<stack>.md`.
- Se um comando falhar por ambiente ausente, pare, relate o bloqueio e nao tente trocar de ambiente automaticamente.
- Container, volume, processo ou porta que voce nao iniciou nesta tarefa nao e
  seu. Nao pare, remova nem altere esse recurso: ele pode pertencer a outro
  projeto que o humano mantem rodando na mesma maquina.
- Se a porta necessaria ja estiver ocupada, pare e pergunte ao humano. Nao mate
  o processo nem pare o container que a ocupa para tomar a porta.
- Nao execute `docker stop` ou `docker compose down` contra containers que voce
  nao iniciou nesta tarefa. Se a origem do container nao estiver clara, pare e
  pergunte ao humano antes de agir.
- Nunca remova um volume que voce nao criou nesta tarefa. Comandos como
  `docker volume rm` e `docker compose down -v` apagam dados que podem ser de
  outro projeto.
- Nao execute `docker system prune` como correcao de ambiente. O comando atinge
  a maquina inteira, nunca apenas o projeto atual, e pode remover recursos de
  outros projetos.
