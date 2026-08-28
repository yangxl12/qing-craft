const ICON_NAMES = [
  "back", "close", "more", "help", "undo", "redo", "fullscreen",
  "exit-fullscreen", "reset-view", "expand", "collapse", "delete", "copy",
  "flip-vertical", "scale-horizontal", "scale-vertical", "check", "info",
  "warning", "saving", "shape", "clay", "pattern", "share"
] as const;

const ICON_NAME_SET = new Set<string>(ICON_NAMES);

Component({
  options: { addGlobalClass:true },
  properties: {
    name: { type:String, value:"info" },
    size: { type:Number, value:40 },
    label: { type:String, value:"" },
    decorative: { type:Boolean, value:false },
    tone: { type:String, value:"dark" }
  },
  data: {
    resolvedName:"info"
  },
  observers: {
    name(value: string) {
      this.setData({ resolvedName:ICON_NAME_SET.has(value) ? value : "info" });
    }
  }
});
