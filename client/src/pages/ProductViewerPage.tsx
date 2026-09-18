import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Center } from "@react-three/drei";
import { Label } from "@radix-ui/react-label"
import { RadioGroup, RadioGroupItem } from "@radix-ui/react-radio-group"

function Model({type}: {type: string}) {
  const { scene } = useGLTF(`/models/${type}.glb`);
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
  const [modelType, setModelType] = useState("home");
  return (
    <div className="h-[calc(100vh-56px)] w-full">
      <RadioGroup defaultValue="home" className="w-fit" onValueChange={(value) => setModelType(value)}>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="home" id="home" />
        <Label htmlFor="home">Home</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="Duck" id="duck" />
        <Label htmlFor="duck">Duck</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="test" id="cat" />
        <Label htmlFor="cat">Cat</Label>
      </div>
    </RadioGroup>
      <Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={<Loading />}>
          <Center>
            <Model type={modelType} />
          </Center>
          <Environment preset="city" />
        </Suspense>
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/Duck.glb");


