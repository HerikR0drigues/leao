# Leão 🦁

Painel local para comandar todas as sessões do Claude Code da máquina num lugar só: quem precisa de você, quem está trabalhando, o que já foi entregue e quanto do limite do plano está indo embora. E um chat completo (perguntas, permissões, imagens, fila, `/comandos`) que gasta o mínimo possível.

## Rodar

```bash
npm install
npm run serve        # compila o front e sobe em http://localhost:4321
```

| Comando | O que faz |
|---|---|
| `npm run serve` | build do front + servidor (uso normal) |
| `npm start` | só o servidor (usa o build que já existe em `dist/`) |
| `npm run dev` | front com hot reload em http://localhost:5173 (precisa do `npm start` rodando; o proxy injeta o token) |
| `npm test` | testes do servidor (`node:test`, inclui chats de ponta a ponta contra um `claude` falso: zero token) |
| `npm run test:web` | testes do front (Vitest + Vue Test Utils, um processo só) |
| `npm run test:all` | os dois |

Variáveis: `LEAO_PORT` (padrão 4321), `LEAO_DATA_DIR` (padrão `~/.leao`), `LEAO_CLAUDE_BIN` (padrão `claude`), `LEAO_TERMINAL` (padrão `gnome-terminal`).

Requisitos: Node ≥ 18 e o `claude` no PATH, logado no seu plano.

## O que tem

- **Visão geral**: quantos agentes esperam você, quantos trabalham, gasto dos últimos 10 min e RAM.
- **Sessões do terminal**: estado, branch, "o que está fazendo agora", contexto e custo; linha do tempo ao vivo lida do transcript (mensagens, ferramentas, perguntas com a resposta escolhida). Escreva nela para **assumir a sessão no Leão**: o terminal é encerrado e a mesma conversa (mesmo id) continua aqui.
- **Chats**: cada um com URL própria (`/chat/<id>`), streaming, perguntas (AskUserQuestion) e permissões em cards clicáveis, imagens (colar/arrastar), fila de mensagens, interromper sem perder o cache, compactar, copiar pergunta/resposta/código.
- **Comandos `/` locais** (sem gastar token): `/model opus`, `/effort high`, `/perfil padrao`, `/permissoes plan`, `/compact`, `/clear`, `/cost`, `/status`. Skills continuam por `/nome-da-skill`.
- **Comandos `!`** na barra do topo: `!status`, `!bloqueadas`, `!ram`, `!custo`, `!parar <nome>`.
- **Entregas**: PRs abertos pela sessão + branch, commits à frente e arquivos alterados no repo e nos submódulos.
- **Limites do plano**: barras da janela de 5h e da semanal.

## Modelos

| No menu | ID usado | Observação |
|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | padrão dos chats novos: o mais barato |
| Sonnet 5.5 | `claude-sonnet-5-5` | |
| Opus 5.5 | `claude-opus-5-5` | |
| Fable 5.1 | `claude-fable-5-1` | o mais capaz; consome o limite bem mais rápido |

IDs conferidos em 2026-10-02 lendo o `model` que o CLI resolve para cada apelido (`haiku`, `sonnet`, `opus`, `fable`). `/model opus` e chats antigos com apelido continuam funcionando.

## Como economiza o limite do plano

Na assinatura não há cobrança por token: o que acaba é a janela de 5h e a semanal. O valor em US$ que aparece é só o equivalente de API, para comparar.

| Mecanismo | Efeito (medido em 2026-10-02) |
|---|---|
| Comandos `/` locais e `!` | Respondidos pelo Leão: **0 token** |
| Painel, sessões, entregas, consumo | Lidos de `claude agents --json`, `/proc`, transcripts e git: **0 token** |
| Processo do chat mantido vivo | A 2ª mensagem reaproveita o prompt cache (~10x mais barata que a 1ª) |
| Perfil **Leve** (padrão) | ~22k tokens de contexto contra ~35k do Completo |
| Haiku 4.5 + esforço `low` por padrão | Sobe só quando você escolhe |

Trocar perfil ou modelo no meio do chat refaz o cache uma vez. Processo de chat parado por 10 min é encerrado (libera RAM) e volta com `--resume`.

## Segurança

Só escuta em `127.0.0.1`, recusa `Host` diferente de `localhost`/`127.0.0.1` (DNS rebinding) e exige token aleatório por execução em toda chamada de API (`~/.leao/token`, `0600`; vai para a página numa `<meta>`). A página tem CSP sem script inline e sem origem externa: fontes e ícones vêm do build, sem CDN e sem telemetria. Markdown das respostas passa pelo DOMPurify. Servidor reiniciado = token novo: a página percebe e recarrega sozinha, mantendo a URL.

Chats rodam com `--permission-mode auto` e `--permission-prompt-tool stdio`; sem o handshake `initialize` o CLI headless esconde o AskUserQuestion (verificado em 2026-10-02).

## Lições de projetos parecidos

Antes do redesign, li as issues mais votadas de [opcode](https://github.com/winfunc/opcode), [Claude Code UI](https://github.com/siteboon/claudecodeui), [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) e [Crystal](https://github.com/stravu/crystal) (usados só como referência; nenhum código copiado). O que veio de lá:

| Problema relatado lá | Aqui |
|---|---|
| Enter com IME/acento envia a mensagem (Claude Code UI #58) | Enter durante composição só confirma o caractere (teste) |
| Cada mensagem abria sessão nova e gastava tokens (Claude Code UI #28) | Processo persistente; `--resume` mantém o mesmo id (teste) |
| Sem compactação no modo headless (Claude Code UI #138) | `/compact` funciona, inclusive no perfil Leve (teste) |
| AskUserQuestion não suportado (Vibe Kanban #1220) | Card de pergunta com opções, múltipla escolha e "Outro" |
| OOM ao reabrir sessão com histórico grande (Vibe Kanban #3218) | Leitura de transcript em blocos de 4 MB, assíncrona: 653 MB com +17 MB de RAM |
| Interface travando com git status (Crystal #192) | Git e transcripts fora da thread principal, com cache |
| Auto-scroll brigando com a leitura (opcode #283) | Só rola sozinho se você já estava no fim; botão "ir para o fim" |
| Saída duplicada no chat (opcode #98) | Uma mensagem por resposta; mensagens repetidas são ignoradas (teste) |
| Esc descarta o que foi digitado (Crystal #183) | Esc não fecha formulário preenchido |
| XSS no front (Crystal #31) e falta de CSP (Crystal #33) | DOMPurify + CSP restrita (teste) |
| App "telefonando para casa" (Crystal #95) | Nenhuma requisição externa |

## Arquitetura

```
server/                    Node puro (sem framework)
  index.js                 HTTP + SSE, rotas, auth
  static.js                build do front com fallback de SPA (F5) e CSP
  sessions.js              monitor de `claude agents --json` (poll 3 s) + alertas
  chats.js                 processos `claude -p` stream-json: fila, perguntas, compactar, custo
  stream.js                tradução dos eventos stream-json
  prompts.js               cards de pergunta/permissão e o control_response
  transcripts.js           linha do tempo, título, PRs e perguntas lidos do transcript
  usage.js                 consumo por sessão a partir do usage (leitura incremental e assíncrona)
  deliveries.js            entregas: branch, commits à frente, alterados (repo + submódulos)
  uploads.js / lines.js    imagens anexadas; leitura de arquivo grande em blocos
  commands.js / catalog.js comandos `!`; skills, agentes e MCP do disco
  profiles.js              perfis, modelos versionados e flags do CLI
web/src/                   Vue 3 + Vite + Vue Router
  views/                   Home, Chat, Sessão, Design System
  components/              TopBar, SideBar, InspectorPanel, ComposerBox, SelectMenu, MessageItem, PromptCard…
  styles/                  tokens.css (Dracula), base.css, realce de código
test/                      servidor (node:test) + fixtures/fake-claude.js
```

Dados em `~/.leao/` (`chats/`, `uploads/`, `cost.json`, `limits.json`, `token`); a pasta `~/.claudao` da versão anterior é migrada na primeira execução.

## Marca

O ícone é um leão desenhado para o projeto, na paleta Dracula do app. O nome não usa a marca Claude; o Leão não é afiliado à Anthropic.

## Local e permissões

Tudo roda na sua máquina, sob o seu próprio login do Claude Code, com os mesmos hooks e permissões de uma sessão normal. O Leão chama o CLI `claude` como subprocesso para isso; não há servidor externo nem chave de API própria.

## Licença

Sem licença de uso definida: o código está público para leitura, e todos os direitos ficam reservados ao autor.
