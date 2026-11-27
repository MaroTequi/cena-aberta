# Cena Aberta mobile

App em React Native e Expo Router. A landing oferece cadastro por convite e login. O cadastro usa o mesmo serviço de e-mail do site. O link recebido permite criar a senha e completar o perfil. Entre no app com a conta confirmada para acessar o catálogo e avaliar episódios.

Configure EXPO_PUBLIC_API_URL em .env.local com a origem HTTPS do site, a mesma usada em NEXTAUTH_URL. Na pasta apps/mobile, execute npm ci e npm start. Abra o projeto no Expo Go compatível com o SDK 58. Na prévia web hospedada em outra origem, os botões da landing abrem a conta no site.

Para validar, execute npm run lint e npm run typecheck.
