export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">MuscleUp</h1>
        <p className="text-lg text-muted-foreground">
          Plataforma de operación de vending de suplementos.
        </p>
        <p className="text-sm text-muted-foreground">
          Scaffold inicial. Próximo paso: aplicar migraciones de base de datos
          y construir el módulo de catálogos.
        </p>
      </div>
    </main>
  );
}
