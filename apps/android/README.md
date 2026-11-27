# Cena Aberta para Android

Protótipo offline em português, com seis obras ilustrativas. O catálogo, o diário, as notas, as resenhas, as escolhas do Sélete e o perfil funcionam no aparelho. O app carrega a interface empacotada no APK. O manifesto dispensa permissão de internet. Perfis de amigos e notícias são demonstrativos.

## Experimentar

Instale o APK de depuração em um Android 8 ou superior. Com um aparelho de desenvolvimento conectado, use `adb install -r app/build/outputs/apk/debug/app-debug.apk`. Para explorar só a interface no PC, sirva a pasta `app/src/main/assets` com `python -m http.server 8080 --bind 127.0.0.1` e abra `http://localhost:8080`.

1. Em **Explorar**, abra **Maré Alta**, escolha a primeira temporada e entre em **Piloto**.
2. Registre uma sessão, atribua uma nota e salve uma resenha. Consulte **Diário**, **Resenhas** e **Perfil → Meu ranking**.
3. Use **Vou ver** para guardar uma obra no perfil. Em **Amigos**, experimente adicionar e remover perfis fictícios.
4. Em **Sélete**, vote nas seis obras. Informe o nome da segunda pessoa e passe o aparelho. O resultado mostra as escolhas em comum.
5. Feche e reabra o aplicativo para conferir os registros locais. Limpar os dados do aplicativo apaga a demonstração.

## Gerar os pacotes

Abra esta pasta no Android Studio ou use o Gradle Wrapper com JDK 17+ e SDK Android 36 instalado. No Windows:

```powershell
.\gradlew.bat :app:assembleDebug :app:bundleRelease
```

- APK de instalação: `app/build/outputs/apk/debug/app-debug.apk`.
- Bundle de release: `app/build/outputs/bundle/release/app-release.aab`. Este projeto gera o release sem assinatura.
- Pacote do protótipo: `br.com.cenaaberta.prototipo`. Min SDK 26, target SDK 36.

## Ficha de teste para Google Play

**Nome:** Cena Aberta  
**Descrição curta:** Descubra obras, registre sessões e escolha o que assistir em dupla.  
**Descrição:** Explore um catálogo demonstrativo de filmes, séries e animes em português. Avalie episódios, escreva resenhas e acompanhe suas sessões no diário. No Sélete, duas pessoas votam no mesmo aparelho para descobrir o que assistiriam juntas. Os dados desta edição ficam no dispositivo.

As capturas em `preview/` mostram a interface em viewport móvel de 390 × 844, renderizada em Chromium. Para iniciar a distribuição, confirme o identificador definitivo, teste em aparelho real, assine o bundle com a chave de upload e preencha a ficha e as declarações no Play Console. A edição conectada às contas do Cena Aberta requer integrar autenticação e serviços do projeto.

[Documentação de assinatura Android](https://developer.android.com/studio/publish/app-signing) · [Requisitos de API da Play](https://developer.android.com/google/play/requirements/target-sdk)
