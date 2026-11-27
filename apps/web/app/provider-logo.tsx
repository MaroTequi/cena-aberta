import type { Provider } from "../lib/streaming";

/** Logotipo de um serviço de streaming; sem imagem (modo demo), mostra a inicial do nome. */
export function ProviderLogo({ provider }: { provider: Provider }) {
  if (!provider.logo)
    return (
      <span className="provider-logo provider-logo-initial" aria-hidden="true">
        {provider.name.slice(0, 1).toUpperCase()}
      </span>
    );
  return (
    // Logo pequeno servido pelo TMDB: o deploy não usa o otimizador de imagens do Next.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="provider-logo" src={provider.logo} alt="" width={32} height={32} loading="lazy" />
  );
}
