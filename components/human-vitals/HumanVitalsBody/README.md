# HumanVitalsBody

Reusable React component for an interactive hologram body map.

## Import

```tsx
import { HumanVitalsBody } from "./components/HumanVitalsBody";

export function HealthSection() {
  return <HumanVitalsBody />;
}
```

The bundled model URLs are also available when the consuming application needs to load or preload a model independently:

```tsx
import { HumanVitalsBody, defaultModelPath, femaleModelPath } from "./components/HumanVitalsBody";

<HumanVitalsBody modelPath={femaleModelPath} />
// defaultModelPath points to the optimized male model.
```

The component imports its own CSS Module and includes the male and female GLB assets through relative asset URLs. The models are optimized with `EXT_meshopt_compression`; the component enables Meshopt decoding internally through `useGLTF`, so the consuming application does not need to copy files into `public` or change its Vite configuration. Its styles are locally scoped by the bundler, so importing it does not overwrite dashboard styles, global buttons, the page background, fonts, or the dashboard layout.

## Dependencies

Install these packages in the consuming React application:

```bash
npm install three @react-three/fiber @react-three/drei lucide-react
```

React and React DOM are expected to already be installed.

## Optional configuration

```tsx
<HumanVitalsBody
  initialZone="heart"
  autoRotate={false}
  showLabels
  bodyVariant="female"
  onZoneSelect={(zone) => console.log(zone.id)}
/>
```

`bodyVariant` accepts `"male"` or `"female"` and defaults to `"female"`. The female model is bundled with the component and is loaded by default. `modelPath` is optional and takes precedence over `bodyVariant` when supplied. `zones` can be supplied to replace the demo readings with application data; each custom zone must follow `VitalZone` from `types.ts`.

The component owns its selection state and does not require a router, state library, CSS framework, or dashboard layout. Import only the component entry point; `App.tsx` and the demo `styles.css` belong to this preview project and are not dependencies of the reusable component.

Both GLB files are bundled assets and are compressed with Meshopt. The consuming application must use a bundler that supports `new URL("./asset.glb", import.meta.url)` (Vite, webpack, Parcel, or an equivalent asset-aware setup). When the component is copied into an existing React application, copy the entire `HumanVitalsBody` directory, including its `assets` folder, rather than copying the models into `public`.
