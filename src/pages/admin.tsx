import React from 'react';
import type { NextPageWithLayout } from '@/types';
import Layout from '@/layouts/_layout';
import { AdminView } from '@/components/AdminView';

const AdminPage: NextPageWithLayout = () => {
  return <AdminView />;
};

AdminPage.getLayout = (page: React.ReactElement) => <Layout>{page}</Layout>;

export default AdminPage;
