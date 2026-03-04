# 🍄 Smurf Defense v1.0

Defenda a Vila Smurf das investidas de Gargamel!

## 🕹️ Como Jogar
1. Abra o `index.html` no seu navegador.
2. Selecione um Smurf no menu inferior:
   - **Robusto (50🍒)**: Atira pedras, balanceado.
   - **Gênio (75🍒)**: Lança poções que deixam os inimigos lentos.
   - **Smurfette (120🍒)**: Longo alcance e alto dano (Sniper).
3. Clique em qualquer lugar do mapa para posicionar a torre.
4. Ganhe **Frutos de Smurf** derrotando inimigos.
5. Impeça que o **Gargamel** (Boss) chegue à vila a cada 10 ondas!

## 🛠️ Personalização (Assets)
O jogo utiliza formas coloridas como placeholders. Para usar imagens reais:
1. Adicione seus arquivos `.png` na pasta `assets/`.
2. No arquivo `src/game.js`, use `this.load.image()` dentro da função `preload`.
3. Substitua `this.add.circle()` por `this.add.sprite()`.

## 🚀 Publicação
1. Faça o Commit de todos os arquivos usando o **GitHub Desktop**.
2. No GitHub, vá em **Settings > Pages**.
3. Selecione o branch `main` e salve para ver seu jogo online!
