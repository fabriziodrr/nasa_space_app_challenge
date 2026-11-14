import Image from "next/image";

type SlothLogoProps = {
  className?: string;
  alt?: string;
  src?: string;
};

export function SlothLogo({ className = "", alt = "S.L.O.T.H. logo", src = "/sloth-logo.jpeg" }: SlothLogoProps) {
  return (
    <span className={`sloth-logo ${className}`.trim()}>
      <Image className="sloth-logo__image" src={src} alt={alt} fill sizes="(max-width: 640px) 32px, 360px" />
    </span>
  );
}
