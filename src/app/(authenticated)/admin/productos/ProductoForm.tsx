"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  crearProducto,
  actualizarProducto,
  type ProductoResult,
} from "./actions";

type Cliente = { id: string; nombre: string };

type Producto = {
  id: string;
  sku: string;
  nombre: string;
  tipo: "polvo" | "vaso";
  marca: string | null;
  sabor: string | null;
  categoria: string | null;
  cliente_exclusivo_id: string | null;
  gramaje_cartucho_default: number;
  gramaje_servicio_default: number | null;
  precio_venta_default: number | null;
  unidad_medida: string;
  notas: string | null;
  stock_minimo: number;
  stock_maximo: number;
  punto_reorden: number;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

const initial: ProductoResult | null = null;

export default function ProductoForm({
  mode,
  producto,
  clientes,
}: {
  mode: "crear" | "editar";
  producto?: Producto;
  clientes: Cliente[];
}) {
  const action = mode === "crear" ? crearProducto : actualizarProducto;
  const [state, formAction] = useFormState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      {producto?.id && <input type="hidden" name="id" value={producto.id} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="SKU" hint="Identificador único interno">
          <input
            name="sku"
            required
            defaultValue={producto?.sku ?? ""}
            placeholder="WPI-VAN-001"
            className="input"
          />
        </Field>

        <Field label="Tipo">
          <select
            name="tipo"
            required
            defaultValue={producto?.tipo ?? "polvo"}
            className="input"
          >
            <option value="polvo">Polvo (suplemento)</option>
            <option value="vaso">Vaso (consumible)</option>
          </select>
        </Field>

        <Field label="Nombre" full>
          <input
            name="nombre"
            required
            defaultValue={producto?.nombre ?? ""}
            placeholder="Whey Protein Isolate"
            className="input"
          />
        </Field>

        <Field label="Marca">
          <input
            name="marca"
            defaultValue={producto?.marca ?? ""}
            className="input"
          />
        </Field>

        <Field label="Sabor">
          <input
            name="sabor"
            defaultValue={producto?.sabor ?? ""}
            placeholder="Vainilla"
            className="input"
          />
        </Field>

        <Field label="Categoría">
          <input
            name="categoria"
            defaultValue={producto?.categoria ?? ""}
            placeholder="Proteína"
            className="input"
          />
        </Field>

        <Field
          label="Cliente exclusivo"
          hint="Solo si este producto es para un cliente específico"
        >
          <select
            name="cliente_exclusivo_id"
            defaultValue={producto?.cliente_exclusivo_id ?? ""}
            className="input"
          >
            <option value="">— Ninguno —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Gramaje cartucho (g)"
          hint="Cantidad por cartucho en gramos"
        >
          <input
            name="gramaje_cartucho_default"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={producto?.gramaje_cartucho_default ?? 400}
            className="input"
          />
        </Field>

        <Field
          label="Gramaje servicio (g)"
          hint="Cantidad por dispensación (shake)"
        >
          <input
            name="gramaje_servicio_default"
            type="number"
            min={1}
            step={1}
            defaultValue={producto?.gramaje_servicio_default ?? ""}
            placeholder="40"
            className="input"
          />
        </Field>

        <Field label="Precio venta (MXN)">
          <input
            name="precio_venta_default"
            type="number"
            min={0}
            step="0.01"
            defaultValue={producto?.precio_venta_default ?? ""}
            placeholder="45.00"
            className="input"
          />
        </Field>

        <Field label="Unidad de medida">
          <input
            name="unidad_medida"
            defaultValue={producto?.unidad_medida ?? "gramos"}
            className="input"
          />
        </Field>

        <Field
          label="Stock mínimo"
          hint="Polvos: gramos totales (granel + cartuchos). Vasos: unidades. Por debajo = crítico."
        >
          <input
            name="stock_minimo"
            type="number"
            min={0}
            step={1}
            defaultValue={producto?.stock_minimo ?? 0}
            className="input"
          />
        </Field>

        <Field
          label="Punto de reorden"
          hint="Cuando el stock llegue aquí, levanta una OC nueva."
        >
          <input
            name="punto_reorden"
            type="number"
            min={0}
            step={1}
            defaultValue={producto?.punto_reorden ?? 0}
            className="input"
          />
        </Field>

        <Field
          label="Stock máximo"
          hint="Stock objetivo después de una compra."
        >
          <input
            name="stock_maximo"
            type="number"
            min={0}
            step={1}
            defaultValue={producto?.stock_maximo ?? 0}
            className="input"
          />
        </Field>

        <Field label="Notas" full>
          <textarea
            name="notas"
            rows={3}
            defaultValue={producto?.notas ?? ""}
            className="input resize-y"
          />
        </Field>
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <SubmitButton
          label={mode === "crear" ? "Crear producto" : "Guardar cambios"}
        />
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          box-shadow:
            0 1px 2px 0 rgb(0 0 0 / 0.05);
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgb(24 24 27);
          box-shadow:
            0 0 0 1px rgb(24 24 27);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${full ? "md:col-span-2" : ""}`}>
      <label className="text-sm font-medium text-zinc-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
