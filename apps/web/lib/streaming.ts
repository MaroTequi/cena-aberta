/** Serviço de streaming, aluguel ou compra, como o catálogo devolve. */
export type Provider = { id: number; name: string; logo: string | null };

/** Onde uma obra pode ser assistida no Brasil (`GET titles/<id>/providers`). */
export type Availability = {
  link: string | null;
  stream: Provider[];
  free: Provider[];
  rent: Provider[];
  buy: Provider[];
};

export type AvailabilityGroup = {
  key: "stream" | "free" | "rent" | "buy";
  label: string;
  providers: (Provider & { subscribed: boolean })[];
};

const groupLabels: Record<AvailabilityGroup["key"], string> = {
  stream: "Assinatura",
  free: "Grátis",
  rent: "Aluguel",
  buy: "Compra",
};

/**
 * Organiza a disponibilidade em grupos para a tela, marcando os serviços que a pessoa assina.
 * Grupos vazios somem; em assinatura e grátis, os serviços assinados vêm primeiro.
 * @param availability resposta do catálogo
 * @param subscribed ids dos serviços que a pessoa marcou nas configurações
 */
export function availabilityGroups(availability: Availability, subscribed: readonly number[]): AvailabilityGroup[] {
  const mine = new Set(subscribed);
  return (["stream", "free", "rent", "buy"] as const)
    .map((key) => {
      const included = key === "stream" || key === "free";
      const providers = availability[key].map((provider) => ({
        ...provider,
        subscribed: included && mine.has(provider.id),
      }));
      if (included) providers.sort((a, b) => Number(b.subscribed) - Number(a.subscribed));
      return { key, label: groupLabels[key], providers };
    })
    .filter((group) => group.providers.length > 0);
}

/** Diz se a obra está incluída em algum serviço que a pessoa assina (assinatura ou grátis). */
export function includedInSubscriptions(availability: Availability, subscribed: readonly number[]): boolean {
  const mine = new Set(subscribed);
  return [...availability.stream, ...availability.free].some((provider) => mine.has(provider.id));
}

/** Liga ou desliga um serviço na lista da pessoa, devolvendo uma lista nova em ordem crescente. */
export function toggleProvider(selected: readonly number[], id: number): number[] {
  const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
  return next.sort((a, b) => a - b);
}
