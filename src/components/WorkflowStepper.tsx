import { StepStatus } from '@/types';
import { Check, X, AlertTriangle, Loader2, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowStepperProps {
  steps: {
    stepNo: number;
    name: string;
    status: StepStatus;
    issuesCount: number;
  }[];
  currentStep?: number;
  onStepClick?: (stepNo: number) => void;
  /** PROJ-25: When true, the currently running step shows a Pause icon instead of spinner */
  isPaused?: boolean;
}

const getStepIcon = (status: StepStatus, isRunPaused: boolean = false) => {
  switch (status) {
    case 'ok':
      return <Check className="w-4 h-4" />;
    case 'failed':
      return <X className="w-4 h-4" />;
    case 'soft-fail':
      return <AlertTriangle className="w-4 h-4" />;
    case 'running':
      return isRunPaused
        ? <Pause className="w-4 h-4" />
        : <Loader2 className="w-4 h-4 animate-spin" />;
    default:
      return null;
  }
};

const getStepCircleClass = (status: StepStatus, isRunPaused: boolean = false) => {
  switch (status) {
    case 'ok':
      return 'stepper-circle-ok';
    case 'failed':
      return 'stepper-circle-failed';
    case 'soft-fail':
      return 'stepper-circle-soft-fail';
    case 'running':
      return isRunPaused ? 'stepper-circle-paused' : 'stepper-circle-running';
    default:
      return 'stepper-circle-pending';
  }
};

export function WorkflowStepper({ steps, currentStep, onStepClick, isPaused = false }: WorkflowStepperProps) {
  return (
    <div className="enterprise-card workflow-stepper-card p-5">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.stepNo} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => onStepClick?.(step.stepNo)}
              className={cn(
                "stepper-step group cursor-pointer transition-opacity hover:opacity-80",
                currentStep === step.stepNo && "opacity-100",
                currentStep !== step.stepNo && "opacity-70"
              )}
            >
              <div className={cn("stepper-circle flex-shrink-0", getStepCircleClass(step.status, isPaused))}>
                {getStepIcon(step.status, isPaused) || step.stepNo}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium text-foreground">
                  {step.name}
                </span>
                {step.issuesCount > 0 && (
                  <span className="text-xs text-status-soft-fail">
                    {step.issuesCount} Issue{step.issuesCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </button>
            {index < steps.length - 1 && (
              <div 
                className={cn(
                  "stepper-line mx-4",
                  step.status === 'ok' && "stepper-line-complete"
                )} 
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
