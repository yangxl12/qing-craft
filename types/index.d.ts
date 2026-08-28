declare const wx: any;
declare function App<T extends Record<string, any>>(config: T & ThisType<T>): void;
declare function Page<D extends Record<string, any>, T extends Record<string, any>>(
  config: T & { data: D } & ThisType<T & { data: D; setData(values: Partial<D> | Record<string, any>, callback?: () => void): void }>
): void;
declare function Component<T extends Record<string, any>>(config: T & ThisType<any>): void;
declare function getCurrentPages(): any[];

interface WechatMiniprogramTouch { clientX: number; clientY: number; identifier: number; force?: number; }
interface WechatMiniprogramTouchEvent { touches: WechatMiniprogramTouch[]; changedTouches: WechatMiniprogramTouch[]; currentTarget: { dataset: Record<string, string> }; detail?: any; timeStamp?: number; }
