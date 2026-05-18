import { redirect } from 'next/navigation'

// Legacy redirect — old "new service awaiting approval" notifications
// link here. The actual pending-services queue lives on /admin under its
// own tab/section, so we just bounce there.
export default function AdminServicesRedirect() {
  redirect('/admin')
}
