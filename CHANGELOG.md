# [0.2.0](https://github.com/ipproyectosysoluciones/dot-whatsapp/compare/v0.1.0...v0.2.0) (2026-11-07)


### Bug Fixes

* **ci:** unblock install, make every job real and park the docker job ([dd23818](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/dd23818754a2f4f908d949299e1681156035484b))
* **deps:** pin follow-redirects to 1.16.2 (GHSA high in <= 1.16.1) ([78662e5](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/78662e5654061ca143142c2ca4ff6040bf541ece))
* **rate-limit:** honor the logged backoff before the first retry ([a4d3ce5](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/a4d3ce51839651e4d2dbf06344956e4947dff88a))
* **rate-limit:** retry failed sends through the queue and cap attempts ([48885f5](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/48885f5e66b0e04a6d959c7b2e694c94843730be))
* **rate-limit:** settle pending promises on dispose ([32cee47](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/32cee47111ffd9320bfbe2a852eef0304e9c3453))
* release workflow with gentle-ai style release body format ([e1e3a14](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/e1e3a1464391c1f0d165755bdda08e81c0dce1ed))
* **release:** install pnpm before the setup-node pnpm cache ([6d00215](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/6d00215bda90bdeb77aee372719bf4b2fb2e9c00)), closes [ref_name#v](https://github.com/ref_name/issues/v)

# [0.1.0](https://github.com/ipproyectosysoluciones/dot-whatsapp/compare/237a99c2497ff8912c81d130674ce42f20c98133...v0.1.0) (2026-10-31)


### Bug Fixes

* release workflow setup-node action version ([019e43a](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/019e43a6838db7a3ba85112eebf905298d40d604))
* **store:** Engram CLI echoes the query in its no-results output ([c113188](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/c1131888d2fcf036bfaa048e8b07591d3b766eb5))


### Features

* **admin:** local token-authed admin API for the Channels panel (T8) ([67e82ca](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/67e82cac089efc565c61030a09e87f7f13386dfb))
* **allowlist:** persist and boot-restore the authorized numbers (T9, S7) ([5b5761e](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/5b5761eb37693aa237283828887063a1d1d4182f))
* **bridge:** emoji-tagged source label [💬 WhatsApp] for channel identity in the app ([d82a922](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/d82a9227eda04ced8e10ba2eb8c3b89a7b1f9106))
* **bridge:** QR pairing via terminal rendering ([3950cbf](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/3950cbfbbcf0b9733984ebd297fd0655174e146d))
* **bridge:** QR pairing via terminal rendering and image file ([554c3c1](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/554c3c1fb65a7af1482d46badf0b5205b08648c4))
* **bridge:** WhatsApp<->daemon relay with allowlist, asks, Engram idempotency ([dcf009c](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/dcf009c67a92d2a1c729fdfff993d08f0fb1839a))
* **meta-cloud:** real Cloud API transport — webhook receiver + Graph sends (T10, S8) ([9b6d97c](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/9b6d97c79dc01ad573a40d1a914e6648f1496642))
* **ops:** systemd --user unit + runbook (service like dot-telegram's) ([da500a8](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/da500a8d8ae2b9aa6597a4c1120238a3567a1c75))
* **scaffold:** dot-whatsapp bridge skeleton from the feasibility study ([237a99c](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/237a99c2497ff8912c81d130674ce42f20c98133))
* **spike:** Baileys QR pairing + 1:1 echo verified against live WhatsApp ([9adf600](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/9adf600af048693f9440d9c8ee825b387d56f14f))
* **transport:** provider factory + meta-cloud stub — S1 seam proof (T7) ([e3b7e91](https://github.com/ipproyectosysoluciones/dot-whatsapp/commit/e3b7e91b6d8079890eea1bbdbffd5f6c8c2ea823))
