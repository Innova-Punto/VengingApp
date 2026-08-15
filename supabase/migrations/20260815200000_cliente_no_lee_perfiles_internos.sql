-- ============================================================================
-- El rol `cliente` deja de leer los perfiles del personal interno
--
-- La policy `profiles_cliente_read` de 20260815180001 pretendía dar "solo el
-- nombre del operador que atendió sus máquinas", pero RLS filtra renglones, no
-- columnas: al dejar pasar la fila entera del operador, el cliente se llevaba
-- también su `email` y su `phone`. Comprobado con el primer usuario de cliente
-- dado de alta: alcanzaba por API los correos de 5 personas internas
-- (dirección y los tres operadores), aunque la UI nunca los muestre.
--
-- No se puede cerrar por privilegios de columna: `getCurrentUser()` lee
-- `email` y `phone` de profiles en cada request para CUALQUIER usuario, así
-- que revocarlas al rol `authenticated` tumbaría el login de todos.
--
-- Se acota entonces la policy a su propia fila, que es lo único que
-- `getCurrentUser()` necesita. El nombre del operador se resuelve en el
-- servidor con el admin client en /admin/servicios (listado y detalle), que
-- es donde de verdad se muestra.
-- ============================================================================

alter policy profiles_cliente_read on public.profiles
  using (id = auth.uid());
