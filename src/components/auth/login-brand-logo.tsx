import Image from "next/image";

const LOGO_SRC = "/images/jbdc-lunch-logo.svg";

/** Approved JBDC lunch mark (bowl, fork, spoon). Decorative on the login card. */
/** Display width; height matches trimmed SVG viewBox (152×125) for tight artwork bounds. */
const LOGO_WIDTH = 160;
const LOGO_HEIGHT = Math.round((125 / 152) * LOGO_WIDTH);

export function LoginBrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`mx-auto w-[160px] max-w-full leading-none ${className}`.trim()}>
      <Image
        src={LOGO_SRC}
        alt=""
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority
        className="block h-auto w-full"
        aria-hidden
      />
    </div>
  );
}
