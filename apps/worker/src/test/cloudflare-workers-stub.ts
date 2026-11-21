/** Stub mínimo da classe base usado apenas nos testes unitários do Durable Object. */
export class DurableObject {
  constructor(
    protected readonly ctx: unknown,
    protected readonly env: unknown,
  ) {}
}
