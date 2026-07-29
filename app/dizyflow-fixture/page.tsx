import {notFound} from "next/navigation";
import {DizyFlowFixtureClient} from "./visual-client";
export default function DizyFlowFixturePage(){if(process.env.NODE_ENV!=="development")notFound();return <DizyFlowFixtureClient/>}
