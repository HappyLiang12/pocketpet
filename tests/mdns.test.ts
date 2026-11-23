import { describe, expect, it } from "vitest";
import type { LanAddress } from "../src/net.js";
import {
  startMdns,
  type MdnsPacket,
  type MdnsQuery,
  type MdnsTransport,
} from "../src/platform/windows/mdns.js";

function lan(address: string, interfaceName = "Wi-Fi", rank = 0): LanAddress {
  return { address, interfaceName, rank };
}

/** Records the registered query listener, every response, and destroy calls. */
function fakeTransport() {
  const queries: Array<(query: MdnsQuery) => void> = [];
  const responses: MdnsPacket[] = [];
  let destroyed = 0;
  const transport: MdnsTransport = {
    on: (_event, listener) => {
      queries.push(listener);
    },
    removeListener: (_event, listener) => {
      const index = queries.indexOf(listener);
      if (index >= 0) queries.splice(index, 1);
    },
    respond: (packet) => {
      responses.push(packet);
    },
    destroy: () => {
      destroyed += 1;
    },
  };
  return {
    transport,
    responses,
    listenerCount: () => queries.length,
    destroyCount: () => destroyed,
    ask(name: string, type: string | number = "A") {
      this.askPacket([{ name, type }]);
    },
    askPacket(questions: Array<{ name?: string; type?: string | number }>) {
      for (const listener of [...queries]) listener({ questions });
    },
  };
}

describe("mDNS responder", () => {
  it("answers an A query for exactly the configured name with every ranked IPv4 address", () => {
    const fake = fakeTransport();
    startMdns({
      hostname: "Happy-PC",
      addresses: [lan("192.168.1.2"), lan("10.0.0.5", "Ethernet")],
      transport: fake.transport,
    });

    fake.ask("happy-pc.local", "A");

    expect(fake.responses).toEqual([
      {
        answers: [
          { name: "happy-pc.local", type: "A", ttl: 120, data: "192.168.1.2" },
          { name: "happy-pc.local", type: "A", ttl: 120, data: "10.0.0.5" },
        ],
      },
    ]);
  });

  it("matches the name case-insensitively and accepts numeric A questions", () => {
    const fake = fakeTransport();
    startMdns({ hostname: "Happy-PC", addresses: [lan("192.168.1.2")], transport: fake.transport });

    fake.ask("HAPPY-PC.LOCAL", "A");
    fake.ask("happy-pc.local", 1);

    expect(fake.responses).toHaveLength(2);
    expect(fake.responses[0]?.answers[0]?.name).toBe("happy-pc.local");
  });

  it("stays silent for other names, including names that merely contain the target", () => {
    const fake = fakeTransport();
    startMdns({ hostname: "happy-pc", addresses: [lan("192.168.1.2")], transport: fake.transport });

    for (const name of ["other.local", "not-happy-pc.local", "happy-pc.local.example", "happy-pc", "happy-pc.local.other"]) {
      fake.ask(name, "A");
    }

    expect(fake.responses).toEqual([]);
  });

  it("never answers AAAA questions and never emits AAAA records", () => {
    const fake = fakeTransport();
    startMdns({ hostname: "happy-pc", addresses: [lan("192.168.1.2")], transport: fake.transport });

    fake.ask("happy-pc.local", "AAAA");
    expect(fake.responses).toEqual([]);

    fake.ask("happy-pc.local", "A");
    expect(fake.responses).toHaveLength(1);
    expect(fake.responses[0]?.answers.map((answer) => answer.type)).toEqual(["A"]);
  });

  it("answers a mixed A/AAAA query with A records only", () => {
    const fake = fakeTransport();
    startMdns({ hostname: "happy-pc", addresses: [lan("192.168.1.2")], transport: fake.transport });

    fake.askPacket([
      { name: "happy-pc.local", type: "AAAA" },
      { name: "happy-pc.local", type: "A" },
    ]);

    expect(fake.responses).toHaveLength(1);
    expect(fake.responses[0]?.answers.map((answer) => answer.type)).toEqual(["A"]);
  });

  it("ignores loopback, non-IPv4 and duplicate addresses", () => {
    const fake = fakeTransport();
    startMdns({
      hostname: "happy-pc",
      addresses: [lan("127.0.0.1"), lan("::1"), lan("192.168.1.2"), lan("192.168.1.2")],
      transport: fake.transport,
    });

    fake.ask("happy-pc.local", "A");

    expect(fake.responses[0]?.answers.map((answer) => answer.data)).toEqual(["192.168.1.2"]);
  });

  it("stop removes the query listener and destroys the transport once", () => {
    const fake = fakeTransport();
    const responder = startMdns({ hostname: "happy-pc", addresses: [lan("192.168.1.2")], transport: fake.transport });
    expect(fake.listenerCount()).toBe(1);

    responder.stop();
    responder.stop();

    expect(fake.listenerCount()).toBe(0);
    expect(fake.destroyCount()).toBe(1);
    fake.ask("happy-pc.local", "A");
    expect(fake.responses).toEqual([]);
  });
});
