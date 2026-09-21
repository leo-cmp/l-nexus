# Roteamento de Modelos

## Fonte de verdade

Consulte `.ai/model-routing.yaml` antes de planejar, executar ou revisar uma
task. Se o arquivo nao existir, pare e oriente a configuracao — nunca invente
uma politica implicita.

## O kit nao escolhe modelo

O roteamento e por **combo** do gateway. Um combo e um nome; atras dele o
gateway mantem uma lista de modelos, escolhe qual atende, faz fallback quando a
cota de um acaba, e nada disso aparece para quem pediu.

Isso e deliberado, e muda o que voce faz:

- **nao ha escolha de modelo a fazer**, e portanto nao ha nada a justificar;
- **nao pergunte ao modelo quem ele e.** Ele so conhece o nome do combo, quando
  conhece. A identidade real vem do campo `model` da resposta do gateway;
- **nao deduza perfil, capacidade ou provedor a partir do combo.** O kit nao
  guarda mais essa informacao, porque ela envelhecia em silencio a cada troca de
  membro feita fora dele.

Quem monta os combos e o humano. E dele a garantia de que papeis diferentes nao
compartilham modelo.

## Como o papel vira combo

```text
RISCO -> roles.<papel>.<default|critical> -> combos.<nome>.effort -> runner
```

1. Classifique complexidade (`L1`–`L3`) e risco (`R1`–`R3`) separadamente.
2. Leia em `roles` o combo do papel. `critical` vale para R3; sem `critical`
   declarado, R3 usa o `default` do papel, e isso e configuracao deliberada.
3. Copie o `effort` que `combos` declara para aquele combo. Nao invente nivel e
   nao traduza: o valor escrito ali e o que sai na requisicao.
4. O runner e `default_runner`, salvo se o combo declarar o seu.

## Effort e declaracao, nao prova

O protocolo nao devolve o nivel de raciocinio aplicado. Voce registra o que
pediu, e isso e tudo o que se pode afirmar. O que volta e mensuravel e
`reasoning_tokens`, quando o provedor reporta — grave quando vier e **omita
quando nao vier**, em vez de preencher com zero ou com suposicao.

Se o runner nao aplicar esforco (`effort.supported: false`), nao registre que o
esforco foi aplicado.

## Registro na task

O registro e a unica parte com identidade real, e por isso a unica que serve de
prova depois:

- `combo`: o que foi pedido;
- `model`: **o campo `model` da resposta**. Gravar o nome do combo aqui nao
  registra nada, porque o combo ja estava no plano;
- `reasoning_tokens`: quando o provedor reportar.

E desses nomes que sai a regra de papeis disjuntos: em R2 e R3 o modelo que
executou nao pode ter passado o teste final nem assinado a revisao. Dois combos
diferentes podem cair no mesmo modelo, entao isso e invisivel no plano — so o
registro pos-execucao enxerga.

## Plano congelado

Depois de registrada qualquer execucao, o `model_plan` nao muda. Congele com
`l-nexus validate-task <task> --write-plan-hash`.

Se o plano precisar mesmo mudar no meio, isso e decisao humana e explicita:
replaneje, diga por que no corpo da task, e revalide com `--allow-replan`.
Reescrever o plano em silencio para que a execucao passe a bater com ele e o
defeito que o congelamento e a testemunha no git existem para impedir.
