# Example models

Test models for trying out PartCatalog 3D. Load them with the file dialog or by dropping them on the page.

| File | What it shows |
| --- | --- |
| `banded-panels.glb` | Four 800 × 400 panels with different edge banding: all four edges, both long edges, one short edge, and none (3 mm back). Board material "Oak decor", banding "ABS 2mm white". |
| `two-cabinets.glb` | The demo cabinet twice, as "Cabinet A" and "Cabinet B" nodes, for grouping by assembly and combining identical parts across cabinets. |
| `170-cabinets.glb` | 170 cabinets of six banded panels each (1,020 parts), for checking performance on large models. |
| `demo-draco.glb` | The demo model with Draco mesh compression. |
| `demo-meshopt.glb` | The demo model with meshopt compression. |

`banded-panels.glb` and `170-cabinets.glb` were generated with [glTF Transform](https://gltf-transform.dev/); `two-cabinets.glb` is `demo.glb` with an extra node level; the compressed files were made with the `gltf-transform draco` and `gltf-transform meshopt` commands.
