# OSI layers' unit of data

Different OSI layers have different unit of data.

| OSI Layer             | Unit of Data                   | Purpose                                                            |
| --------------------- | ------------------------------ | ------------------------------------------------------------------ |
| Layer 7 – Application | Message / Data                 | The actual content your app cares about (HTTP request, JSON, etc.) |
| Layer 4 – Transport   | Segment (TCP) / Datagram (UDP) | Provides reliability, ordering, and port-based delivery            |
| Layer 3 – Network     | Packet                         | Adds source/destination IP, routing info                           |
| Layer 2 – Data Link   | Frame                          | Adds MAC addresses, error detection (Ethernet)                     |
| Layer 1 – Physical    | Bits                           | Physical transmission over wire, fiber, or air                     |
