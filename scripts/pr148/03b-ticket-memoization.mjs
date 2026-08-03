import {readFile,writeFile} from "node:fs/promises";

const path="app/manual-paper-ticket.tsx";
let source=await readFile(path,"utf8");
const old=`  const choosePercent = useCallback(
    (percent: number) => {
      const safe = Math.min(100, Math.max(0, percent));
      setSizePercent(safe);
      setAmount(String(sliderToAmount(safe, equity, mode, leverageNumber)));
    },
    [equity, mode, leverageNumber],
  );`;
const next=`  const choosePercent = (percent: number) => {
    const safe = Math.min(100, Math.max(0, percent));
    setSizePercent(safe);
    setAmount(String(sliderToAmount(safe, equity, mode, leverageNumber)));
  };`;
if(source.split(old).length-1!==1)throw new Error("ticket percent memoization anchor unavailable");
source=source.replace(old,next);
await writeFile(path,source);
