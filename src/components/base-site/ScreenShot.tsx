import Image from 'next/image'
import styles from './base-site.module.css'

/**
 * Een echt scherm uit BASE, paginabreed neergezet.
 *
 * Dit is de plek van de productfotografie die een fysiek product wél heeft en
 * software niet. De regel die daaruit volgt: er staat hier nooit een natekening
 * van de app. Staat er geen opname klaar, dan toont dit component een leeg
 * kader met een mono-label, zodat meteen zichtbaar is dat er nog iets moet
 * gebeuren in plaats van dat een plaatje de echte opname stilzwijgend vervangt.
 *
 * Opnames worden gemaakt op een gemaskeerd, bevroren scherm: namen,
 * programmatitels en geboortejaren zijn dan al vervangen door verzonnen
 * waarden. Zet hier dus nooit zomaar een opname in die je ergens anders vandaan
 * hebt; zie het opnameprotocol in docs/.
 */
export function ScreenShot({
  src,
  alt,
  breedte,
  hoogte,
  bijschrift,
  kader = false,
  prioriteit = false,
  children,
}: {
  src?: string
  alt: string
  breedte?: number
  hoogte?: number
  /** Optioneel mono-onderschrift; de pagina gebruikt ze niet meer (24-08,
   *  Jurre wil geen labels onder de beelden), maar het slot blijft bestaan. */
  bijschrift?: string
  /** Het kruisjeskader staat op precies één beeld per pagina. */
  kader?: boolean
  prioriteit?: boolean
  /** Tijdelijk proefbeeld (MockScreens.tsx) zolang de echte opname er niet
   *  is; een gezet `src` wint altijd van dit kind. */
  children?: React.ReactNode
}) {
  const klassen = [styles.shot, kader ? styles.xframe : ''].filter(Boolean).join(' ')

  return (
    <figure className={styles.shotWrap}>
      <div className={klassen}>
        {src && breedte && hoogte ? (
          <Image
            src={src}
            alt={alt}
            width={breedte}
            height={hoogte}
            sizes="(max-width: 1280px) 100vw, 1280px"
            priority={prioriteit}
            className={styles.shotImg}
          />
        ) : children ? (
          <div className={styles.shotVul} role="img" aria-label={alt}>
            {children}
          </div>
        ) : (
          <div className={styles.shotLeeg} role="img" aria-label={alt}>
            <span>Schermopname volgt</span>
          </div>
        )}
      </div>
      {bijschrift ? <figcaption className={styles.shotCap}>{bijschrift}</figcaption> : null}
    </figure>
  )
}
