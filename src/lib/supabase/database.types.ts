/**
 * Tipos generados de Supabase.
 *
 * Este archivo se reemplaza ejecutando:
 *   npm run db:types
 *
 * Que internamente corre:
 *   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * Mientras no haya migraciones aplicadas, exportamos un tipo placeholder
 * para que los clientes tipados compilen.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
