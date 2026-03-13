import ngrok from '@ngrok/ngrok';

interface TunnelOptions {
  /** Local port to tunnel to */
  port: number;
  /** ngrok auth token — falls back to NGROK_AUTHTOKEN env var */
  authtoken?: string;
}

interface Tunnel {
  /** Public HTTPS URL */
  url: string;
  /** Close the tunnel */
  close: () => Promise<void>;
}

/**
 * Start an ngrok tunnel to the given local port.
 * Returns the public HTTPS URL and a close function.
 */
export async function startTunnel(options: TunnelOptions): Promise<Tunnel> {
  const authtoken = options.authtoken ?? process.env['NGROK_AUTHTOKEN'];
  if (!authtoken) {
    throw new Error(
      'ngrok auth token is required. Set NGROK_AUTHTOKEN in .env or pass authtoken option.',
    );
  }

  const listener = await ngrok.forward({
    addr: options.port,
    authtoken,
  });

  const url = listener.url();
  if (!url) {
    throw new Error('Failed to get ngrok tunnel URL');
  }

  console.log(`[ngrok] Tunnel established: ${url} → localhost:${options.port}`);

  return {
    url,
    close: async () => {
      await listener.close();
      console.log('[ngrok] Tunnel closed');
    },
  };
}
