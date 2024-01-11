declare namespace DDPCommon {
  interface MethodInvocation {
    userId?: string;
    // Define other properties and methods you need
  }
}

declare namespace DDP {
  var _CurrentMethodInvocation: any;
}
