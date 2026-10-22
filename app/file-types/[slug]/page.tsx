import { notFound } from "next/navigation";
import Link from "next/link";

const FORMATS: Record<string, { name: string; live: boolean; description: string }> = {
  pdf: {
    name: "PDF",
    live: true,
    description:
      "VaultRecover uses qpdf, a well-maintained open-source PDF library, to detect real password protection and verify candidate passwords by actually decrypting your file.",
  },
  zip: {
    name: "ZIP",
    live: true,
    description:
      "VaultRecover inspects the real ZIP central directory to detect encrypted entries, then verifies candidates against the archive's actual integrity check — traditional PKWARE (ZipCrypto) encryption is supported.",
  },
  rar: {
    name: "RAR",
    live: false,
    description:
      "RAR recovery is not yet wired to the automated engine. This page is informational — upload will tell you it's not yet supported for automated recovery.",
  },
  "7z": {
    name: "7-Zip",
    live: true,
    description:
      "VaultRecover uses the real 7z CLI (p7zip) to detect header- and content-encrypted 7z archives and verify candidates with a genuine integrity test against the actual archive.",
  },
  word: {
    name: "Word (.doc/.docx)",
    live: true,
    description: "VaultRecover uses msoffcrypto-tool to detect genuine open-password protection (distinct from edit/print restrictions) and verify candidate passwords by actually decrypting the document.",
  },
  excel: {
    name: "Excel (.xls/.xlsx)",
    live: true,
    description: "VaultRecover uses msoffcrypto-tool to detect genuine open-password protection (distinct from edit/print restrictions) and verify candidate passwords by actually decrypting the document.",
  },
  powerpoint: {
    name: "PowerPoint (.ppt/.pptx)",
    live: true,
    description: "VaultRecover uses msoffcrypto-tool to detect genuine open-password protection (distinct from edit/print restrictions) and verify candidate passwords by actually decrypting the document.",
  },
};

export function generateStaticParams() {
  return Object.keys(FORMATS).map((slug) => ({ slug }));
}

export default async function FormatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const format = FORMATS[slug];
  if (!format) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold text-graphite-200">{format.name} password recovery</h1>
      <p className="mt-4 text-graphite-400">{format.description}</p>
      {format.live ? (
        <Link href="/dashboard" className="btn-accent mt-8 inline-flex">Recover a {format.name} file — free</Link>
      ) : (
        <p className="mt-8 rounded-md border border-graphite-700 bg-graphite-900 p-4 text-sm text-graphite-400">
          Not yet supported for automated recovery execution. You can still upload one to see the
          detection result, but recovery won&apos;t run for this format yet.
        </p>
      )}
    </div>
  );
}
