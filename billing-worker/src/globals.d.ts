declare module '*.html' {
  const content: string;
  export default content;
}

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index');
  }
}
