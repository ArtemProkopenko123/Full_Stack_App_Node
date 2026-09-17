import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Center } from "@react-three/drei";

function Model() {
  const { scene } = useGLTF("/models/Duck.glb");
  return <primitive object={scene} scale={1.2} />;
}

function Loading() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="lightgray" wireframe />
    </mesh>
  );
}

export default function ProductViewerPage() {
  return (
    <div className="h-[calc(100vh-56px)] w-full">
      <Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={<Loading />}>
          <Center>
            <Model />
          </Center>
          <Environment preset="city" />
        </Suspense>
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/Duck.glb");
