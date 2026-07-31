import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TimelineStep } from '../../../core/models';

@Component({
  selector: 'app-event-timeline',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './event-timeline.component.html',
})
export class EventTimelineComponent {
  @Input({ required: true }) steps: TimelineStep[] = [];
  @Input() compact = false;
}
