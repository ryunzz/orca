import { extend, type ThreeElement } from "@react-three/fiber";
import { SplatMesh, SparkRenderer } from "@sparkjsdev/spark";

extend({ SparkSplatMesh: SplatMesh, SparkSparkRenderer: SparkRenderer });

declare module "@react-three/fiber" {
  interface ThreeElements {
    sparkSplatMesh: ThreeElement<typeof SplatMesh>;
    sparkSparkRenderer: ThreeElement<typeof SparkRenderer>;
  }
}
