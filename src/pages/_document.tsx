import Document, {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document';

class CustomDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    return Document.getInitialProps(ctx);
  }
  
  render() {
    return (
      <Html lang="en-US" dir="ltr">
        <Head>
          {/* Load fonts, etc. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap"
            rel="stylesheet"
          />

          {/* 
            Inline script to read localStorage and set data-theme immediately.
          */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  try {
                    var storedTheme = localStorage.getItem('theme');
                    if (storedTheme) {
                      // Only allow light or dark themes
                      if (storedTheme === 'light' || storedTheme === 'dark') {
                        document.documentElement.setAttribute('data-theme', storedTheme);
                      } else {
                        document.documentElement.setAttribute('data-theme', 'dark');
                      }
                    } else {
                      // If no theme is stored, default to dark:
                      document.documentElement.setAttribute('data-theme', 'dark');
                    }
                  } catch (e) {
                    // On error, fall back to dark:
                    document.documentElement.setAttribute('data-theme', 'dark');
                  }
                })();
              `,
            }}
          />
          {/* Brand logo from /public/xyra-logo.png */}
          <link rel="icon" href="/xyra-logo.png" type="image/png" />
          <link rel="apple-touch-icon" href="/xyra-logo.png" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default CustomDocument;
