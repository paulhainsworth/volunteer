type Handler = (request: Request) => Promise<Response>;
type ClientFactory = (url: string, key: string) => unknown;

let registeredHandler: Handler;
let clientFactory: ClientFactory = () => {
  throw new Error('Unexpected Supabase call');
};

export function serve(handler: Handler) {
  registeredHandler = handler;
}

export function createClient(url: string, key: string) {
  return clientFactory(url, key);
}

export function setClient(factory: ClientFactory) {
  clientFactory = factory;
}

export function handler() {
  return registeredHandler;
}

export function request(body: object, method = 'POST') {
  return new Request('https://fixture.invalid/function', {
    method,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}
