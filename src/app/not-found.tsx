import Link from "next/link";

export default function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-4 text-lg">Page not found</p>
      <Link href="/" className="mt-8 text-blue-600 hover:underline">
        Go back home
      </Link>
    </div>
  );
}
