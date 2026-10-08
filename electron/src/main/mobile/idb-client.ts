import {
  Client,
  credentials,
  status,
  type ClientWritableStream,
  type ClientUnaryCall,
  type ClientDuplexStream,
  type ServiceDefinition,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import path from 'node:path';

type Message = Record<string, unknown>;
type Call = ClientUnaryCall | ClientWritableStream<Message> | ClientDuplexStream<Message, Message>;
type Target = { udid: string; screen_dimensions?: { width: number; width_points: number } };
const MAX_BYTES = 12 * 1024 * 1024;

/** Only the app-owned companion's private Unix socket is accepted. No registry or network discovery. */
export class IdbClient {
  private readonly client: Client;
  private readonly methods: ServiceDefinition;
  private readonly calls = new Set<Call>();
  private closed = false;

  constructor(socket: string, protoPath: string) {
    if (!path.isAbsolute(socket)) throw new Error('iOS bridge requires a private Unix socket.');
    this.methods = loadSync(protoPath, { keepCase: true, longs: Number, defaults: true })[
      'idb.CompanionService'
    ] as ServiceDefinition;
    this.client = new Client(`unix:${socket}`, credentials.createInsecure(), {
      'grpc.max_receive_message_length': MAX_BYTES,
      'grpc.max_send_message_length': MAX_BYTES,
      'grpc.enable_retries': 0,
    });
  }

  close(): void {
    this.closed = true;
    for (const call of this.calls) call.cancel();
    this.calls.clear();
    this.client.close();
  }

  async describe(): Promise<Target> {
    return (await this.unary('describe', {})).target_description as Target;
  }
  async screenshot(): Promise<Buffer> {
    return (await this.unary('screenshot', {})).image_data as Buffer;
  }
  async inspect(): Promise<string> {
    const value = (await this.unary('accessibility_info', { format: 0 })).json;
    if (typeof value !== 'string' || !value) throw new Error('iOS accessibility is unavailable.');
    return value.slice(0, 100_000);
  }
  async tap(x: number, y: number): Promise<void> {
    await this.hid(press({ touch: { point: { x, y } } }));
  }
  async swipe(x: number, y: number, toX: number, toY: number, duration: number): Promise<void> {
    await this.hid([{ swipe: { start: { x, y }, end: { x: toX, y: toY }, duration } }]);
  }
  async button(button: 'home' | 'enter' | 'backspace' | 'back'): Promise<void> {
    if (button === 'back') throw new Error('iOS has no Back button.');
    await this.hid(
      press(button === 'home' ? { button: { button: 1 } } : { key: { keycode: button === 'enter' ? 40 : 42 } }),
    );
  }
  async text(text: string): Promise<void> {
    if (text.length > 2000 || !/^[\x20-\x7e]*$/.test(text))
      throw new Error('Device typing supports printable ASCII, up to 2000 characters.');
    const events: Message[] = [];
    for (const character of text) {
      const [keycode, shifted] = asciiKey(character);
      if (shifted) events.push({ press: { action: { key: { keycode: 225 } }, direction: 0 } });
      events.push(...press({ key: { keycode } }));
      if (shifted) events.push({ press: { action: { key: { keycode: 225 } }, direction: 1 } });
    }
    if (events.length) await this.hid(events);
  }
  async launch(bundleId: string): Promise<void> {
    if (this.closed) throw new Error('iOS bridge is closed. Attach again.');
    const method = this.methods.launch!;
    await new Promise<void>((resolve, reject) => {
      const call = this.client.makeBidiStreamRequest<Message, Message>(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        { deadline: Date.now() + 15_000 },
      );
      this.calls.add(call);
      let received = 0;
      call.on('data', (value: Message) => {
        received += method.responseSerialize(value).length;
        if (received > MAX_BYTES) call.cancel();
      });
      call.once('error', (error) => {
        this.calls.delete(call);
        reject(bridgeError(error));
      });
      call.once('end', () => {
        this.calls.delete(call);
        resolve();
      });
      call.end({ start: { bundle_id: bundleId, foreground_if_running: true, wait_for: false } });
    });
  }

  private async unary(name: string, request: Message): Promise<Message> {
    if (this.closed) throw new Error('iOS bridge is closed. Attach again.');
    const method = this.methods[name]!;
    return new Promise((resolve, reject) => {
      const call = this.client.makeUnaryRequest<Message, Message>(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        request,
        { deadline: Date.now() + 15_000 },
        (error, result) => {
          this.calls.delete(call);
          if (error) reject(bridgeError(error));
          else resolve(result!);
        },
      );
      this.calls.add(call);
    });
  }
  private async hid(events: Message[]): Promise<void> {
    if (this.closed) throw new Error('iOS bridge is closed. Attach again.');
    const method = this.methods.hid!;
    await new Promise<void>((resolve, reject) => {
      const call = this.client.makeClientStreamRequest<Message, Message>(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        { deadline: Date.now() + 15_000 },
        (error) => {
          this.calls.delete(call);
          if (error) reject(bridgeError(error));
          else resolve();
        },
      );
      this.calls.add(call);
      for (const event of events) call.write(event);
      call.end();
    });
  }
}

function press(action: Message): Message[] {
  return [{ press: { action, direction: 0 } }, { press: { action, direction: 1 } }];
}
function bridgeError(error: { code?: number }): Error {
  return new Error(
    `iOS bridge request failed (${status[error.code ?? status.UNKNOWN]}). Check the simulator or detach and attach again.`,
  );
}
// USB HID keyboard usage IDs for the simulator's US ASCII keyboard, including balanced Shift presses.
function asciiKey(character: string): [number, boolean] {
  if (/[a-z]/i.test(character))
    return [character.toLowerCase().charCodeAt(0) - 97 + 4, character !== character.toLowerCase()];
  const digits = '1234567890';
  if (digits.includes(character)) return [30 + digits.indexOf(character), false];
  const shiftedDigits = '!@#$%^&*()';
  if (shiftedDigits.includes(character)) return [30 + shiftedDigits.indexOf(character), true];
  const punctuation = [' ', '-_', '=+', '[{', ']}', '\\|', ';:', '\'"', '`~', ',<', '.>', '/?'];
  const keycodes = [44, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56];
  const index = punctuation.findIndex((pair) => pair.includes(character));
  return [keycodes[index]!, punctuation[index]!.indexOf(character) === 1];
}
