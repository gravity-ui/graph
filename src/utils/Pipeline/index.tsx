
export type PipelineStepBatchState = {
  type: string, // indicate that need run apply batch
}

export type PipelineBatchConfig<Item, Context> = | 
  { batched?: false } | 
  {
    batched: true;
    batchBefore?: (context: Context) => void;
    batchDone?: (context: Context) => void;
    getBatchType?: (state: Item, context: Context) => unknown;
  }

export type PipelineStepConfig<Item, Context> = {} & PipelineBatchConfig<Item, Context>;

export type PipelineIterateCallback<Item, Context> = (item: Item, context: Context) => void;

export class Pipeline<Item = {}, Context = undefined> {

  protected steps = new Map<string, PipelineIterateCallback<Item, Context>>();

  protected stepConfigs = new Map<string, PipelineStepConfig<Item, Context>>();

  protected context: Context;

  public setContext(context: Context) {
    this.context = context;
  }

  public step(name: string, fn: PipelineIterateCallback<Item, Context>, config?: PipelineStepConfig<Item, Context>): this {
    if (this.steps.has(name)) {
      console.warn('rewrite pipeline step');
      this.deleteStep(name);
    } 
    this.steps.set(name, fn);
    if (config) {
      this.stepConfigs.set(name, config);
    }
    return this;
  }

  public deleteStep(name: string) {
    this.steps.delete(name);
    this.stepConfigs.delete(name);
  }

  protected buildPipeline(steps: string[], context: Context) {
    const pipeline = [];
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      const config = this.stepConfigs.get(step);
      if (config?.batched) {
        pipeline.push((datas: Item[]) => this.runBatchStep(step, config, datas, context))
        continue;
      }

      let slice = steps.slice(stepIndex);
      // index of next batch step
      const nextBatchStep = slice.findIndex((step) => this.stepConfigs.get(step)?.batched);
      if (nextBatchStep >= 0) {
        slice = slice.slice(0, nextBatchStep);
        stepIndex = stepIndex + nextBatchStep - 1;
      }
      pipeline.push((datas: Item[]) => {
        // console.log('pipeline', `run ${slice.join(', ')} steps`);
        datas.forEach((data) => {
          slice.forEach((step) => {
            const fn = this.steps.get(step);
            fn(data, context);
          })
        });
        // console.log('pipeline', `done ${slice.join(', ')} steps`);
      })
    }
    return pipeline;
  }

  public run1(steps: string[], states: Item[], context: Context) {
    const pipeline = this.buildPipeline(steps, context);

    pipeline.forEach((step) => step(states));
  }

  public run(steps: string[], states: Item[], context: Context) {
    const pipeline = this.buildPipeline(steps, context);

    pipeline.forEach((step) => step(states));
  }

  protected runBatchStep(step: string, config: PipelineStepConfig<Item, Context>, states: Item[], context: Context) {
    if(!config.batched) {
      return;
    }
    const runStep = this.steps.get(step);
    let donned = false;
    // console.log('pipeline', 'run batch for', states.length, 'items');
    config?.batchBefore?.(context);
    let type = config?.getBatchType?.(states[0], context);
    runStep(states[0], context);
    for (let i = 1; i < states.length; i++) {
      const nextType = config?.getBatchType?.(states[i], context);
      if (type !== config?.getBatchType?.(states[i], context)) {
        donned = true;
        // console.log('pipeline', 'run batchDone for');
        config?.batchDone?.(context);
        config?.batchBefore?.(context);
        type = nextType;
      }
      donned = false;
      runStep(states[i], context);
    }
    if (!donned) {
      // console.log('pipeline', 'run batchDone for');
      config?.batchDone?.(context);
    }
  }

}
