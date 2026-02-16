import { StepStatus } from '@/types';
import { Check, X, AlertTriangle, Loader2 } from 'lucide-react';
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
}

const getStepIcon = (status: StepStatus) => {
  switch (status) {
    case 'ok':
      return <Check className="w-4 h-4" />;
    case 'failed':
      return <X className="w-4 h-4" />;
    case 'soft-fail':
      return <AlertTriangle className="w-4 h-4" />;
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin" />;
    default:
      return null;
  }
};

const getStepCircleClass = (status: StepStatus) => {
  switch (status) {
    case 'ok':
      return 'stepper-circle-ok';
    case 'failed':
      return 'stepper-circle-failed';
    case 'soft-fail':
      return 'stepper-circle-soft-fail';
    case 'running':
      return 'stepper-circle-running';
    default:
      return 'stepper-circle-pending';
  }
};

export function WorkflowStepper({ steps, currentStep, onStepClick }: WorkflowStepperProps) {
  return (
    <div className="enterprise-card p-6">
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
              <div className={cn("stepper-circle flex-shrink-0", getStepCircleClass(step.status))}>
                {getStepIcon(step.status) || step.stepNo}
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
