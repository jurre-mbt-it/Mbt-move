import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Volgende factuurnummer: `MBT26_0001` (MBT + tweecijferig jaar + `_` + volgnummer).
 * Het volgnummer komt uit de Postgres-sequence `shop_invoice_seq` (gat-loos,
 * concurrency-veilig) en loopt dóór over de jaren heen (reset niet per jaar).
 * Roep dit binnen dezelfde transactie aan waarin de order op PAID wordt gezet,
 * zodat een nummer alleen wordt verbruikt bij een echte betaling.
 */
export async function nextInvoiceNumber(db: Db): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT nextval('shop_invoice_seq') AS n`,
  )
  const n = Number(rows[0].n)
  const yy = String(new Date().getUTCFullYear()).slice(-2)
  return `MBT${yy}_${String(n).padStart(4, '0')}`
}
